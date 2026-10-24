import "dotenv/config";
import pg from "pg";
import assert from "node:assert/strict";
import { cosine } from "../src/lib/features";
if (!process.env.ADMIN_DATABASE_URL) throw new Error("Set ADMIN_DATABASE_URL");
const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await c.connect();
try {
  assert.equal(
    (await c.query("SELECT count(*) FROM game_rounds r JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE m.data_source='synthetic'")).rows[0].count,
    "144",
  );
  const vectors = (
    await c.query(
      "SELECT profile::text FROM tactical_embeddings ORDER BY round_id LIMIT 2",
    )
  ).rows.map((r) => JSON.parse(r.profile) as number[]);
  const sim = Number(
    (
      await c.query(
        "SELECT 1-(a.profile <=> b.profile) score FROM tactical_embeddings a,tactical_embeddings b WHERE a.round_id=1 AND b.round_id=2",
      )
    ).rows[0].score,
  );
  assert.ok(Math.abs(sim - cosine(vectors[0], vectors[1])) < 1e-6);
  const prediction = (
    await c.query("CALL sp_predict_win_probability(1,19500,19500,NULL,NULL)")
  ).rows[0];
  assert.ok(
    Number(prediction.probability) >= 0 && Number(prediction.probability) <= 1,
  );
  assert.ok(Number(prediction.sample_size) > 0);
  assert.equal(
    (await c.query("SELECT count(*) FROM mv_player_leaderboards")).rows[0]
      .count,
    "15",
  );
  const invalid = async (sql: string) => {
    await c.query("SAVEPOINT invalid");
    let rejected = false;
    try {
      await c.query(sql);
    } catch {
      rejected = true;
    }
    await c.query("ROLLBACK TO SAVEPOINT invalid");
    assert.ok(rejected, sql);
  };
  await c.query("BEGIN");
  await invalid(
    "INSERT INTO matches(tournament_id,team1_id,team2_id,played_at,format) VALUES(1,1,1,now(),3)",
  );
  await invalid(
    "INSERT INTO game_rounds(game_id,round_number,winning_team_id,attacking_team_id,win_condition) VALUES(1,99,3,1,'Defuse')",
  );
  await invalid(
    "INSERT INTO player_round_stats(round_id,game_id,player_id,kills,deaths,damage,combat_score,economy_credits,credits_spent) VALUES(1,2,1,0,0,1,1,1,1)",
  );
  await invalid(
    "INSERT INTO tactical_embeddings(round_id,profile,source) VALUES(1,'[1,2]','synthetic')",
  );
  const alertCount = Number(
    (await c.query("SELECT count(*) FROM alerts")).rows[0].count,
  );
  const r = (
    await c.query(
      "INSERT INTO game_rounds(game_id,round_number,winning_team_id,attacking_team_id,win_condition) VALUES(1,99,1,1,'Defuse') RETURNING id",
    )
  ).rows[0].id;
  await c.query(
    "INSERT INTO player_round_stats(round_id,game_id,player_id,kills,deaths,damage,combat_score,economy_credits,credits_spent) VALUES($1,1,1,1,0,5000,5150,4000,3900)",
    [r],
  );
  assert.equal(
    Number((await c.query("SELECT count(*) FROM alerts")).rows[0].count),
    alertCount + 1,
  );
  await c.query("ROLLBACK");
  await c.query("BEGIN");
  await c.query("SET LOCAL ROLE vtac_app");
  await invalid("DROP TABLE alerts");
  await invalid("UPDATE users SET role='Head_Coach' WHERE id=2");
  await c.query("ROLLBACK");
  console.log(
    "Database checks passed: fixtures, vector parity, procedure, leaderboards, constraints, anomaly trigger, runtime privileges.",
  );
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
