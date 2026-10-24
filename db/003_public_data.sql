BEGIN;
CREATE TABLE data_sources (
 slug text PRIMARY KEY, name text NOT NULL, url text NOT NULL,
 description text NOT NULL, terms_url text
);
INSERT INTO data_sources VALUES
 ('synthetic','Synthetic training fixtures','https://github.com/Suhasmk124/v-tac','Generated demonstration telemetry; no real matches.',NULL),
 ('vct-reference','VCT Reference','https://vct-reference.com/dataset','Public VCT match, map, player-map and round economy records. No event coordinates in this export.','https://vct-reference.com/terms');
CREATE TABLE data_imports (
 id serial PRIMARY KEY, source_slug text NOT NULL REFERENCES data_sources,
 sha256 text NOT NULL CHECK(length(sha256)=64), selection text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(), counts jsonb NOT NULL,
 UNIQUE(source_slug,sha256,selection)
);
ALTER TABLE teams ADD COLUMN source_key text UNIQUE;
ALTER TABLE teams ADD COLUMN country text;
ALTER TABLE players ADD COLUMN source_key text UNIQUE;
ALTER TABLE tournaments ADD COLUMN source_key text UNIQUE;
ALTER TABLE tournaments ALTER COLUMN prize_pool DROP NOT NULL;
ALTER TABLE players DROP CONSTRAINT players_role_check;
ALTER TABLE players ADD CHECK(role IN ('Duelist','Initiator','Controller','Sentinel','Flex','Unknown'));
ALTER TABLE matches ADD COLUMN data_source text NOT NULL DEFAULT 'synthetic' REFERENCES data_sources;
ALTER TABLE matches ADD COLUMN import_id int REFERENCES data_imports;
ALTER TABLE matches ADD COLUMN source_key text UNIQUE;
ALTER TABLE matches ADD COLUMN source_url text;
ALTER TABLE matches ADD COLUMN patch text;
ALTER TABLE matches ADD COLUMN veto jsonb;
ALTER TABLE match_games ADD COLUMN source_key text UNIQUE;
ALTER TABLE game_rounds ALTER COLUMN attacking_team_id DROP NOT NULL;
ALTER TABLE game_rounds DROP CONSTRAINT game_rounds_win_condition_check;
ALTER TABLE game_rounds ADD CHECK(win_condition IN ('Elimination','Detonation','Defuse','Time','Unknown'));
CREATE INDEX ON matches(data_source,tournament_id,played_at);
CREATE TABLE map_coverage (
 game_id int PRIMARY KEY REFERENCES match_games,
 player_stats boolean NOT NULL, economy boolean NOT NULL,
 positions boolean NOT NULL DEFAULT false, source_performance boolean NOT NULL,
 observed_rounds int NOT NULL CHECK(observed_rounds>=0), expected_rounds int NOT NULL CHECK(expected_rounds>=0)
);
CREATE TABLE player_game_stats (
 game_id int NOT NULL, player_id int NOT NULL, team_id int NOT NULL,
 rounds_played int NOT NULL CHECK(rounds_played>0),
 kills int CHECK(kills>=0), deaths int CHECK(deaths>=0), assists int CHECK(assists>=0),
 acs numeric CHECK(acs>=0), adr numeric CHECK(adr>=0),
 headshot_pct numeric CHECK(headshot_pct BETWEEN 0 AND 100),
 kast numeric CHECK(kast BETWEEN 0 AND 100), first_kills int CHECK(first_kills>=0), first_deaths int CHECK(first_deaths>=0),
 PRIMARY KEY(game_id,player_id),
 FOREIGN KEY(game_id,player_id,team_id) REFERENCES game_rosters(game_id,player_id,team_id)
);
CREATE TABLE team_round_economy (
 round_id int NOT NULL, game_id int NOT NULL, team_id int NOT NULL REFERENCES teams,
 loadout_value int CHECK(loadout_value BETWEEN 0 AND 65535), bank int CHECK(bank BETWEEN 0 AND 65535),
 PRIMARY KEY(round_id,team_id), FOREIGN KEY(round_id,game_id) REFERENCES game_rounds(id,game_id)
);
CREATE FUNCTION validate_economy_team() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM match_games g JOIN matches m ON m.id=g.match_id WHERE g.id=NEW.game_id AND NEW.team_id IN(m.team1_id,m.team2_id)) THEN
 RAISE EXCEPTION 'Economy team must participate in match'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER economy_team BEFORE INSERT OR UPDATE ON team_round_economy FOR EACH ROW EXECUTE FUNCTION validate_economy_team();
CREATE TABLE scouting_notes (
 id serial PRIMARY KEY, game_id int NOT NULL REFERENCES match_games,
 author_id int NOT NULL REFERENCES users, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON scouting_notes(game_id,created_at);
GRANT SELECT ON data_sources,data_imports,map_coverage,player_game_stats,team_round_economy,scouting_notes TO vtac_app;
GRANT INSERT ON scouting_notes TO vtac_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vtac_app;
COMMIT;
