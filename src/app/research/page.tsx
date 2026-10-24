import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { resolveSource } from "@/lib/scouting";
export const dynamic = "force-dynamic";
export default async function Research({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const p = await searchParams;
  const positive = z.coerce.number().int().positive().max(2147483647);
  const suppliedRound = positive.safeParse(p.round);
  const reference = suppliedRound.success
    ? (
        await query(
          "SELECT m.data_source FROM game_rounds r JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE r.id=$1",
          [suppliedRound.data],
        )
      )[0]
    : null;
  const source = await resolveSource(p.source ?? reference?.data_source);
  const isReal = source.slug === "vct-reference";
  const defaults = (
    await query(
      "SELECT r.id,g.map_id,m.team2_id FROM tactical_embeddings e JOIN game_rounds r ON r.id=e.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE m.data_source=$1 ORDER BY m.played_at DESC,r.id LIMIT 1",
      [source.slug],
    )
  )[0];
  const round = positive.catch(defaults?.id ?? 1).parse(p.round);
  const map = positive.catch(defaults?.map_id ?? 1).parse(p.map);
  const team = positive.catch(defaults?.team2_id ?? 2).parse(p.team);
  const spend = z.coerce
    .number()
    .int()
    .min(0)
    .max(45000)
    .catch(19500)
    .parse(p.spend);
  const opponent = z.coerce
    .number()
    .int()
    .min(0)
    .max(45000)
    .catch(19500)
    .parse(p.opponent);
  const maps = await query(
    "SELECT DISTINCT mp.id,mp.name FROM maps mp JOIN match_games g ON g.map_id=mp.id JOIN matches m ON m.id=g.match_id WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const teams = await query(
    "SELECT DISTINCT t.id,t.name FROM teams t JOIN matches m ON t.id IN(m.team1_id,m.team2_id) WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const neighbors = await query(
    `SELECT r.id,r.round_number,mp.name map,t.name winner,e.source,
            round((1-(e.profile <=> target.profile))::numeric,4) similarity
     FROM tactical_embeddings e
     JOIN tactical_embeddings target
       ON target.round_id=$1 AND target.feature_version=e.feature_version
     JOIN game_rounds reference_round ON reference_round.id=target.round_id
     JOIN match_games reference_game
       ON reference_game.id=reference_round.game_id AND reference_game.map_id=$2
     JOIN matches reference_match ON reference_match.id=reference_game.match_id AND reference_match.data_source=$3
     JOIN game_rounds r ON r.id=e.round_id
     JOIN match_games g ON g.id=r.game_id
     JOIN matches candidate_match ON candidate_match.id=g.match_id AND candidate_match.data_source=$3
     JOIN maps mp ON mp.id=g.map_id
     JOIN teams t ON t.id=r.winning_team_id
     WHERE e.round_id<>$1 AND g.map_id=$2
     ORDER BY e.profile <=> target.profile LIMIT 6`,
    [round, map, source.slug],
  );
  // Each candidate composition is one row per game. Count rounds without joining picks (avoids fan-out).
  const counters = await query(
    `WITH compositions AS (SELECT gr.game_id,gr.team_id,string_agg(a.agent_name,', ' ORDER BY a.agent_name) composition FROM game_rosters gr JOIN agent_picks a USING(game_id,player_id) GROUP BY gr.game_id,gr.team_id HAVING count(*)=5), results AS (SELECT r.game_id,count(*) rounds,count(*) FILTER(WHERE r.winning_team_id<>$1) wins FROM game_rounds r GROUP BY r.game_id) SELECT c.composition,sum(z.rounds) rounds,round(100.0*sum(z.wins)/nullif(sum(z.rounds),0),1) win_rate,count(*) games FROM compositions c JOIN match_games g ON g.id=c.game_id JOIN matches m ON m.id=g.match_id JOIN results z ON z.game_id=g.id WHERE g.map_id=$2 AND m.data_source=$3 AND $1 IN(m.team1_id,m.team2_id) AND c.team_id<>$1 GROUP BY c.composition ORDER BY win_rate DESC,rounds DESC`,
    [team, map, source.slug],
  );
  const estimate =
    user.role === "Head_Coach"
      ? (isReal
          ? await query(
              `SELECT round((count(*) FILTER(WHERE r.winning_team_id=a.team_id)+1.0)/(count(*)+2.0),4) probability,count(*) sample_size FROM team_round_economy a JOIN team_round_economy b ON b.round_id=a.round_id AND b.team_id<>a.team_id JOIN game_rounds r ON r.id=a.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE g.map_id=$1 AND m.data_source=$4 AND abs(a.loadout_value-$2)<=2500 AND abs(b.loadout_value-$3)<=2500`,
              [map, spend, opponent, source.slug],
            )
          : await query("SELECT * FROM predict_win_probability($1,$2,$3)", [
              map,
              spend,
              opponent,
            ]))[0]
      : null;
  return (
    <main className="content">
      <Link className="back" href={`/?source=${source.slug}`}>
        ← Workspace
      </Link>
      <p className="eyebrow">TACTICAL LAB / {source.name}</p>
      <h1>
        Find a pattern.
        <br />
        <span>Pressure-test your plan.</span>
      </h1>
      <div className="notice">
        {isReal
          ? "Economy-only round features; no inferred positions or player-round statistics. "
          : "Engineered numeric telemetry features. "}
        Same feature version and dataset only · 1.0 similarity is the closest
        possible match. Different maps use different coordinate frames; results
        are restricted to the selected map.
      </div>
      <form className="panel controls">
        <input type="hidden" name="source" value={source.slug} />
        <label>
          Reference round ID
          <input name="round" type="number" min="1" defaultValue={round} />
        </label>
        <label>
          Map
          <select name="map" defaultValue={map}>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opponent team
          <select name="team" defaultValue={team}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {isReal ? "Your team loadout value" : "Your credits spent"}
          <input
            name="spend"
            type="number"
            min="0"
            max="45000"
            defaultValue={spend}
          />
        </label>
        <label>
          {isReal ? "Opponent team loadout value" : "Opponent credits spent"}
          <input
            name="opponent"
            type="number"
            min="0"
            max="45000"
            defaultValue={opponent}
          />
        </label>
        <button>Run analysis →</button>
      </form>
      <div className="section-heading">
        <h2>Similar historical rounds</h2>
        <span>Cosine similarity / pgvector</span>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Map</th>
              <th>Winner</th>
              <th>Similarity</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {neighbors.map((n) => (
              <tr key={n.id}>
                <td>
                  <Link href={`/rounds/${n.id}`}>
                    #{n.id} · R{n.round_number} →
                  </Link>
                </td>
                <td>{n.map}</td>
                <td>{n.winner}</td>
                <td className="accent">{n.similarity}</td>
                <td>{n.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!neighbors.length && (
          <p className="panel">
            No comparable rounds. Check the reference ID, map and feature
            coverage.
          </p>
        )}
      </div>
      <div className="lower-grid">
        <section className="panel">
          <p className="eyebrow">COUNTER-PICK EVIDENCE</p>
          <h2>Compositions against this opponent</h2>
          <p className="subtle">
            Observed round win rates on the selected map. Small samples and team
            strength can dominate these results.
          </p>
          {counters.map((c, i) => (
            <p key={i}>
              {c.composition}
              <br />
              <strong className="accent">{c.win_rate}%</strong> · {c.rounds}{" "}
              rounds · {c.games} games
            </p>
          ))}
          {!counters.length && <p>No historical matchups available.</p>}
        </section>
        <section className="panel">
          <p className="eyebrow">ECONOMY MODEL · COACH ACCESS</p>
          <h2>Historical win estimate</h2>
          {estimate ? (
            <>
              <h1 className="accent">
                {Number(estimate.sample_size)
                  ? `${(Number(estimate.probability) * 100).toFixed(1)}%`
                  : "No evidence"}
              </h1>
              <p className="subtle">
                {estimate.sample_size} comparable team-round observations within
                ±2,500 {isReal ? "loadout value" : "credits spent"} per team.
                Laplace smoothing; no calibration or causal interpretation.
                Paired observations may include both sides of a round.
              </p>
            </>
          ) : (
            <p className="subtle">
              Sign in as a Head Coach to run the economy estimate.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
