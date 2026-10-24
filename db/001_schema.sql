BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE teams (id serial PRIMARY KEY, name text UNIQUE NOT NULL, region text NOT NULL, world_rank int CHECK(world_rank > 0));
CREATE TABLE players (id serial PRIMARY KEY, team_id int REFERENCES teams, handle text UNIQUE NOT NULL, role text NOT NULL CHECK(role IN ('Duelist','Initiator','Controller','Sentinel','Flex')));
CREATE TABLE tournaments (id serial PRIMARY KEY, name text UNIQUE NOT NULL, start_date date NOT NULL, prize_pool numeric(14,2) NOT NULL DEFAULT 0 CHECK(prize_pool >= 0));
CREATE TABLE matches (id serial PRIMARY KEY, tournament_id int NOT NULL REFERENCES tournaments, team1_id int NOT NULL REFERENCES teams, team2_id int NOT NULL REFERENCES teams, played_at timestamptz NOT NULL, format int NOT NULL CHECK(format IN (1,3,5)), CHECK(team1_id <> team2_id));
CREATE TABLE maps (id serial PRIMARY KEY, name text UNIQUE NOT NULL, release_patch text);
CREATE TABLE match_games (id serial PRIMARY KEY, match_id int NOT NULL REFERENCES matches, map_id int NOT NULL REFERENCES maps, game_number int NOT NULL CHECK(game_number > 0), team1_score int NOT NULL DEFAULT 0 CHECK(team1_score >= 0), team2_score int NOT NULL DEFAULT 0 CHECK(team2_score >= 0), UNIQUE(match_id,game_number));
CREATE TABLE game_rosters (game_id int REFERENCES match_games, player_id int REFERENCES players, team_id int NOT NULL REFERENCES teams, PRIMARY KEY(game_id,player_id), UNIQUE(game_id,player_id,team_id));
CREATE TABLE game_rounds (id serial PRIMARY KEY, game_id int NOT NULL REFERENCES match_games, round_number int NOT NULL CHECK(round_number > 0), winning_team_id int NOT NULL REFERENCES teams, attacking_team_id int NOT NULL REFERENCES teams, win_condition text NOT NULL CHECK(win_condition IN ('Elimination','Detonation','Defuse','Time')), UNIQUE(game_id,round_number), UNIQUE(id,game_id));
CREATE TABLE player_round_stats (id serial PRIMARY KEY, round_id int NOT NULL, game_id int NOT NULL, player_id int NOT NULL, kills int NOT NULL CHECK(kills BETWEEN 0 AND 10), deaths int NOT NULL CHECK(deaths BETWEEN 0 AND 2), assists int NOT NULL DEFAULT 0 CHECK(assists >= 0), damage int NOT NULL CHECK(damage >= 0), combat_score int NOT NULL CHECK(combat_score >= 0), economy_credits int NOT NULL CHECK(economy_credits BETWEEN 0 AND 9000), credits_spent int NOT NULL CHECK(credits_spent BETWEEN 0 AND 9000), FOREIGN KEY(round_id,game_id) REFERENCES game_rounds(id,game_id), FOREIGN KEY(game_id,player_id) REFERENCES game_rosters(game_id,player_id), UNIQUE(round_id,player_id));
CREATE TABLE agent_picks (id serial PRIMARY KEY, game_id int NOT NULL, player_id int NOT NULL, agent_name text NOT NULL, FOREIGN KEY(game_id,player_id) REFERENCES game_rosters(game_id,player_id), UNIQUE(game_id,player_id));
CREATE TABLE weapon_buys (id serial PRIMARY KEY, round_id int NOT NULL, game_id int NOT NULL, player_id int NOT NULL, weapon_name text NOT NULL, armor_tier int NOT NULL CHECK(armor_tier IN (0,25,50)), FOREIGN KEY(round_id,game_id) REFERENCES game_rounds(id,game_id), FOREIGN KEY(game_id,player_id) REFERENCES game_rosters(game_id,player_id), UNIQUE(round_id,player_id));
CREATE TABLE kill_events (id serial PRIMARY KEY, round_id int NOT NULL, game_id int NOT NULL, killer_id int NOT NULL, victim_id int NOT NULL, weapon_used text NOT NULL, is_headshot boolean NOT NULL DEFAULT false, seconds_elapsed numeric NOT NULL CHECK(seconds_elapsed >= 0), x numeric CHECK(x BETWEEN 0 AND 1), y numeric CHECK(y BETWEEN 0 AND 1), FOREIGN KEY(round_id,game_id) REFERENCES game_rounds(id,game_id), FOREIGN KEY(game_id,killer_id) REFERENCES game_rosters(game_id,player_id), FOREIGN KEY(game_id,victim_id) REFERENCES game_rosters(game_id,player_id), CHECK(killer_id <> victim_id), CHECK((x IS NULL) = (y IS NULL)));
CREATE TABLE tactical_embeddings (id serial PRIMARY KEY, round_id int UNIQUE NOT NULL REFERENCES game_rounds, profile vector(128) NOT NULL, feature_version text NOT NULL DEFAULT 'vtac-v1', source text NOT NULL CHECK(source IN ('synthetic','imported')));
CREATE TABLE users (id serial PRIMARY KEY, email text UNIQUE NOT NULL CHECK(email=lower(email)), password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('Head_Coach','Scout_Analyst')));
CREATE TABLE alerts (id serial PRIMARY KEY, stat_id int NOT NULL REFERENCES player_round_stats ON DELETE CASCADE, baseline_mean numeric NOT NULL, baseline_stddev numeric NOT NULL, observed_damage int NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON matches(tournament_id,played_at);
CREATE INDEX ON match_games(match_id,map_id);
CREATE INDEX ON player_round_stats(player_id,round_id);
CREATE INDEX ON kill_events(round_id);

CREATE FUNCTION check_game_teams() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a int; b int;
BEGIN
 SELECT m.team1_id,m.team2_id INTO a,b FROM match_games g JOIN matches m ON m.id=g.match_id WHERE g.id=NEW.game_id;
 IF TG_TABLE_NAME='game_rosters' THEN
   IF NEW.team_id NOT IN (a,b) THEN RAISE EXCEPTION 'Roster team must participate in the match'; END IF;
 ELSE
   IF NEW.winning_team_id NOT IN (a,b) OR NEW.attacking_team_id NOT IN (a,b) THEN RAISE EXCEPTION 'Round teams must participate in the match'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_roster BEFORE INSERT OR UPDATE ON game_rosters FOR EACH ROW EXECUTE FUNCTION check_game_teams();
CREATE TRIGGER validate_round BEFORE INSERT OR UPDATE ON game_rounds FOR EACH ROW EXECUTE FUNCTION check_game_teams();

CREATE FUNCTION flag_anomaly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE avg_damage numeric; sd numeric; n int;
BEGIN
 SELECT avg(s.damage),stddev_samp(s.damage),count(*) INTO avg_damage,sd,n
 FROM player_round_stats s JOIN game_rounds r ON r.id=s.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id
 WHERE s.player_id=NEW.player_id AND s.id<>NEW.id
 AND m.tournament_id=(SELECT mm.tournament_id FROM match_games gg JOIN matches mm ON mm.id=gg.match_id WHERE gg.id=NEW.game_id);
 IF n>=10 AND sd>0 AND abs(NEW.damage-avg_damage)>3*sd THEN
 INSERT INTO alerts(stat_id,baseline_mean,baseline_stddev,observed_damage) VALUES(NEW.id,avg_damage,sd,NEW.damage);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stats_anomaly AFTER INSERT ON player_round_stats FOR EACH ROW EXECUTE FUNCTION flag_anomaly();

CREATE MATERIALIZED VIEW mv_player_leaderboards AS
WITH stats AS (
 SELECT m.tournament_id,s.player_id,count(*) rounds,sum(s.kills) kills,sum(s.deaths) deaths,round(avg(s.combat_score),1) acs,round(avg(s.damage),1) adr
 FROM player_round_stats s JOIN game_rounds r ON r.id=s.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id GROUP BY m.tournament_id,s.player_id
), hs AS (
 SELECT m.tournament_id,k.killer_id,round(100.0*count(*) FILTER(WHERE k.is_headshot)/nullif(count(*),0),1) headshot_pct
 FROM kill_events k JOIN game_rounds r ON r.id=k.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id GROUP BY m.tournament_id,k.killer_id
)
SELECT s.*,p.handle,p.role,coalesce(h.headshot_pct,0) headshot_pct FROM stats s JOIN players p ON p.id=s.player_id LEFT JOIN hs h ON h.tournament_id=s.tournament_id AND h.killer_id=s.player_id;
CREATE UNIQUE INDEX ON mv_player_leaderboards(tournament_id,player_id);

CREATE FUNCTION predict_win_probability(p_map int,p_spend int,p_opponent_spend int)
RETURNS TABLE(probability numeric,sample_size bigint) LANGUAGE sql STABLE AS $$
 WITH economies AS (
 SELECT r.id,r.winning_team_id,gr.team_id,sum(s.credits_spent) spend
 FROM player_round_stats s JOIN game_rounds r ON r.id=s.round_id JOIN match_games g ON g.id=r.game_id JOIN game_rosters gr ON gr.game_id=s.game_id AND gr.player_id=s.player_id
 WHERE g.map_id=p_map GROUP BY r.id,r.winning_team_id,gr.team_id HAVING count(*)=5
 ), samples AS (
 SELECT a.winning_team_id=a.team_id won FROM economies a JOIN economies b ON a.id=b.id AND a.team_id<>b.team_id
 WHERE abs(a.spend-p_spend)<=2500 AND abs(b.spend-p_opponent_spend)<=2500
 ) SELECT round((count(*) FILTER(WHERE won)+1.0)/(count(*)+2.0),4),count(*) FROM samples;
$$;
CREATE PROCEDURE sp_predict_win_probability(IN p_map int,IN p_spend int,IN p_opponent_spend int,INOUT probability numeric DEFAULT NULL,INOUT sample_size bigint DEFAULT NULL)
LANGUAGE plpgsql AS $$ BEGIN SELECT p.probability,p.sample_size INTO probability,sample_size FROM predict_win_probability(p_map,p_spend,p_opponent_spend) p; END $$;

-- Application uses a restricted login; no schema ownership or DDL rights.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtac_app') THEN CREATE ROLE vtac_app LOGIN PASSWORD 'local_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
GRANT USAGE ON SCHEMA public TO vtac_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vtac_app;
REVOKE SELECT ON users FROM vtac_app;
GRANT SELECT(id,email,password_hash,role) ON users TO vtac_app;
GRANT INSERT,UPDATE ON teams,players TO vtac_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vtac_app;
COMMIT;
