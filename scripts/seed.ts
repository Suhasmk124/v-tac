import "dotenv/config";
import pg from "pg";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { embed } from "../src/lib/features";
if (!process.env.ADMIN_DATABASE_URL) throw new Error("Set ADMIN_DATABASE_URL");
const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await c.connect();
const password =
  process.env.SEED_PASSWORD || randomBytes(18).toString("base64url");
if (Buffer.byteLength(password, "utf8") > 72)
  throw new Error("Bcrypt passwords must be at most 72 UTF-8 bytes");
try {
  await c.query("BEGIN");
  if ((await c.query("SELECT 1 FROM teams LIMIT 1")).rowCount)
    throw new Error("Seed requires an empty database; existing data preserved");
  for (const [name, region] of [
    ["Neon Wolves", "APAC"],
    ["Crimson Five", "EMEA"],
    ["Atlas Core", "Americas"],
  ])
    await c.query("INSERT INTO teams(name,region) VALUES($1,$2)", [
      name,
      region,
    ]);
  const roles = ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"];
  for (let i = 0; i < 15; i++)
    await c.query("INSERT INTO players(team_id,handle,role) VALUES($1,$2,$3)", [
      Math.floor(i / 5) + 1,
      ["flare", "echo", "haze", "lock", "drift"][i % 5] +
        (Math.floor(i / 5) + 1),
      roles[i % 5],
    ]);
  await c.query(
    "INSERT INTO tournaments(name,start_date,prize_pool) VALUES('V-Tac Synthetic Invitational','2026-01-01',0)",
  );
  await c.query(
    "INSERT INTO maps(name,release_patch) VALUES('Ascent','demo'),('Haven','demo'),('Lotus','demo')",
  );
  for (let g = 1; g <= 6; g++) {
    const opponent = g % 2 === 0 ? 3 : 2,
      map = Math.ceil(g / 2);
    await c.query(
      "INSERT INTO matches(tournament_id,team1_id,team2_id,played_at,format) VALUES(1,1,$1,$2,1)",
      [opponent, `2026-01-${String(g).padStart(2, "0")}T12:00:00Z`],
    );
    await c.query(
      "INSERT INTO match_games(match_id,map_id,game_number) VALUES($1,$2,1)",
      [g, map],
    );
    const ids = [
      1,
      2,
      3,
      4,
      5,
      ...Array.from({ length: 5 }, (_, i) => (opponent - 1) * 5 + i + 1),
    ];
    const agents = [
      "Jett",
      "Sova",
      "Omen",
      "Killjoy",
      "KAY/O",
      ...(opponent === 2
        ? ["Raze", "Fade", "Astra", "Cypher", "Breach"]
        : ["Jett", "Sova", "Omen", "Cypher", "Skye"]),
    ];
    for (let i = 0; i < 10; i++) {
      await c.query("INSERT INTO game_rosters VALUES($1,$2,$3)", [
        g,
        ids[i],
        i < 5 ? 1 : opponent,
      ]);
      await c.query(
        "INSERT INTO agent_picks(game_id,player_id,agent_name) VALUES($1,$2,$3)",
        [g, ids[i], agents[i]],
      );
    }
    let score = 0;
    for (let r = 1; r <= 24; r++) {
      const won = (r + g) % 5 < 3;
      if (won) score++;
      const round = (
        await c.query(
          "INSERT INTO game_rounds(game_id,round_number,winning_team_id,attacking_team_id,win_condition) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [
            g,
            r,
            won ? 1 : opponent,
            r <= 12 ? 1 : opponent,
            r % 4 === 0 ? "Defuse" : "Elimination",
          ],
        )
      ).rows[0].id;
      const spend = ids.map((_, i) =>
        r % 6 === 1 ? 800 : (r + i) % 4 === 0 ? 2100 : 3900,
      );
      const events = Array.from({ length: 5 }, (_, i) => ({
        x: (((r * 7 + i * 13 + g) % 90) + 5) / 100,
        y: (((r * 11 + i * 17) % 90) + 5) / 100,
        seconds: 15 + i * 17,
        weapon: spend[i] > 3000 ? "Vandal" : "Spectre",
      }));
      const damage = ids.map((_, i) => 80 + ((r * 17 + i * 23 + g * 11) % 170));
      for (let i = 0; i < 10; i++) {
        const winningPlayer = won ? i < 5 : i >= 5;
        await c.query(
          "INSERT INTO player_round_stats(round_id,game_id,player_id,kills,deaths,assists,damage,combat_score,economy_credits,credits_spent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            round,
            g,
            ids[i],
            winningPlayer ? 1 : 0,
            winningPlayer ? 0 : 1,
            i % 3,
            damage[i],
            damage[i] + (winningPlayer ? 150 : 0),
            Math.min(9000, spend[i] + 1200),
            spend[i],
          ],
        );
        await c.query(
          "INSERT INTO weapon_buys(round_id,game_id,player_id,weapon_name,armor_tier) VALUES($1,$2,$3,$4,$5)",
          [
            round,
            g,
            ids[i],
            spend[i] > 3000 ? "Vandal" : spend[i] > 1000 ? "Spectre" : "Ghost",
            spend[i] > 3000 ? 50 : 25,
          ],
        );
      }
      for (let i = 0; i < 5; i++)
        await c.query(
          "INSERT INTO kill_events(round_id,game_id,killer_id,victim_id,weapon_used,is_headshot,seconds_elapsed,x,y) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            round,
            g,
            ids[won ? i : i + 5],
            ids[won ? i + 5 : i],
            spend[won ? i : i + 5] > 3000
              ? "Vandal"
              : spend[won ? i : i + 5] > 1000
                ? "Spectre"
                : "Ghost",
            i % 3 === 0,
            events[i].seconds,
            events[i].x,
            events[i].y,
          ],
        );
      // Match the actual event weapon encoding.
      events.forEach(
        (e, i) =>
          (e.weapon =
            spend[won ? i : i + 5] > 3000
              ? "Vandal"
              : spend[won ? i : i + 5] > 1000
                ? "Spectre"
                : "Ghost"),
      );
      await c.query(
        "INSERT INTO tactical_embeddings(round_id,profile,source) VALUES($1,$2,'synthetic')",
        [
          round,
          JSON.stringify(embed({ spend, damage, kills: events, agents })),
        ],
      );
    }
    await c.query(
      "UPDATE match_games SET team1_score=$1,team2_score=$2 WHERE id=$3",
      [score, 24 - score, g],
    );
  }
  for (const [email, role] of [
    ["coach@vtac.local", "Head_Coach"],
    ["scout@vtac.local", "Scout_Analyst"],
  ])
    await c.query(
      "INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)",
      [email, await hash(password, 12), role],
    );
  await c.query("REFRESH MATERIALIZED VIEW mv_player_leaderboards");
  await c.query("COMMIT");
  console.log("Seeded 6 synthetic games, 144 rounds, 1440 stat records.");
  console.log(
    "Local accounts: coach@vtac.local / scout@vtac.local; password:",
    password,
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  await c.end();
}
