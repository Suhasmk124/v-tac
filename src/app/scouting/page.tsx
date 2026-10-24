import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveSource, wilson } from "@/lib/scouting";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function Scouting({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const p = await searchParams;
  const source = await resolveSource(p.source);
  const teams = await query(
    "SELECT DISTINCT t.id,t.name FROM teams t JOIN matches m ON t.id IN(m.team1_id,m.team2_id) WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const team = z.coerce
    .number()
    .int()
    .positive()
    .max(2147483647)
    .catch(teams[0]?.id ?? 1)
    .parse(p.team);
  const min = z.coerce.number().int().min(1).max(100).catch(3).parse(p.min);
  const event = z.coerce
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .catch(0)
    .parse(p.event);
  const events = await query(
    "SELECT DISTINCT t.id,t.name FROM tournaments t JOIN matches m ON m.tournament_id=t.id WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const name = teams.find((t) => t.id === team)?.name ?? "Unknown team";
  const filter =
    "m.data_source=$1 AND $2 IN(m.team1_id,m.team2_id) AND ($3::int=0 OR m.tournament_id=$3)";
  const args = [source.slug, team, event];
  const maps = await query<{
    id: number;
    name: string;
    games: string;
    wins: string;
  }>(
    `SELECT p.id,p.name,count(*) games,count(*) FILTER(WHERE CASE WHEN m.team1_id=$2 THEN g.team1_score>g.team2_score ELSE g.team2_score>g.team1_score END) wins FROM match_games g JOIN matches m ON m.id=g.match_id JOIN maps p ON p.id=g.map_id WHERE ${filter} AND g.team1_score<>g.team2_score GROUP BY p.id ORDER BY games DESC`,
    args,
  );
  const sides = await query(
    `SELECT CASE WHEN r.attacking_team_id=$2 THEN 'Attack' ELSE 'Defense' END side,count(*) rounds,count(*) FILTER(WHERE r.winning_team_id=$2) wins,count(*) FILTER(WHERE r.round_number IN(1,13)) pistols,count(*) FILTER(WHERE r.round_number IN(1,13) AND r.winning_team_id=$2) pistol_wins FROM game_rounds r JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE ${filter} AND r.attacking_team_id IS NOT NULL GROUP BY 1`,
    args,
  );
  const economy = await query(
    `SELECT CASE WHEN e.loadout_value<10000 THEN 'Eco (<10k)' WHEN e.loadout_value<20000 THEN 'Partial (10–20k)' ELSE 'Full (20k+)' END buy,count(*) rounds,count(*) FILTER(WHERE r.winning_team_id=$2) wins FROM team_round_economy e JOIN game_rounds r ON r.id=e.round_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE ${filter} AND e.team_id=$2 AND e.loadout_value IS NOT NULL GROUP BY 1 ORDER BY 1`,
    args,
  );
  const candidates = maps
    .filter((m) => Number(m.games) >= min)
    .map((m) => ({ ...m, range: wilson(Number(m.wins), Number(m.games)) }))
    .sort((a, b) => a.range.upper - b.range.upper);
  return (
    <main className="content">
      <Link className="back" href={`/?source=${source.slug}`}>
        ← Workspace
      </Link>
      <p className="eyebrow">OPPONENT SCOUTING / {source.name}</p>
      <h1>Prepare for {name}.</h1>
      <form className="panel controls">
        <input type="hidden" name="source" value={source.slug} />
        <label>
          Opponent
          <select name="team" defaultValue={team}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select name="event" defaultValue={event}>
            <option value="0">All imported events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum maps for suggestions
          <input
            name="min"
            type="number"
            min="1"
            max="100"
            defaultValue={min}
          />
        </label>
        <button>Build report →</button>
      </form>
      <section className="lower-grid">
        <article className="panel">
          <p className="eyebrow">MAP-VETO EVIDENCE</p>
          <h2>Maps to investigate</h2>
          {candidates.slice(0, 3).map((m) => (
            <p key={m.id}>
              <strong>{m.name}</strong> · Opponent won {m.wins}/{m.games}
              <br />
              <small>
                95% WILSON RANGE: {(m.range.lower * 100).toFixed(0)}–
                {(m.range.upper * 100).toFixed(0)}%
              </small>
            </p>
          ))}
          {!candidates.length && <p>No map meets your sample threshold.</p>}
          <p className="subtle">
            Ordered by the lowest upper confidence bound on opponent map win
            rate. This summarizes historical evidence; opponent strength, patch
            and veto selection affect results. Maps from the same series are
            correlated.
          </p>
        </article>
        <article className="panel">
          <p className="eyebrow">ATTACK / DEFENSE</p>
          <h2>Side and pistol performance</h2>
          {sides.map((s) => (
            <p key={s.side}>
              <strong>
                {s.side}:{" "}
                {((100 * Number(s.wins)) / Number(s.rounds)).toFixed(1)}%
              </strong>{" "}
              · {s.wins}/{s.rounds} rounds
              <br />
              <small>
                PISTOLS: {s.pistol_wins}/{s.pistols} (ROUNDS 1 AND 13)
              </small>
            </p>
          ))}
          {!sides.length && <p>No recorded side data.</p>}
        </article>
      </section>
      <h2 style={{ marginTop: 30 }}>Map pool</h2>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Map</th>
              <th>Maps</th>
              <th>Wins</th>
              <th>Win %</th>
              <th>95% range</th>
            </tr>
          </thead>
          <tbody>
            {maps.map((m) => {
              const r = wilson(Number(m.wins), Number(m.games));
              return (
                <tr key={m.id}>
                  <td>
                    <Link
                      href={`/library?source=${source.slug}&q=${encodeURIComponent(name)}&map=${m.id}&event=${event}`}
                    >
                      {m.name} →
                    </Link>
                  </td>
                  <td>{m.games}</td>
                  <td>{m.wins}</td>
                  <td className="accent">
                    {((100 * Number(m.wins)) / Number(m.games)).toFixed(1)}%
                  </td>
                  <td>
                    {(r.lower * 100).toFixed(0)}–{(r.upper * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="panel" style={{ marginTop: 25 }}>
        <p className="eyebrow">ECONOMY DISCIPLINE</p>
        <h2>Observed round results by loadout</h2>
        {economy.length ? (
          economy.map((e) => (
            <p key={e.buy}>
              {e.buy}:{" "}
              <strong className="accent">
                {((100 * Number(e.wins)) / Number(e.rounds)).toFixed(1)}%
              </strong>{" "}
              · {e.wins}/{e.rounds} rounds
            </p>
          ))
        ) : (
          <p>
            No team loadout observations in this dataset. Synthetic individual
            spends are a different measure.
          </p>
        )}
        <p className="subtle">
          Loadout value is the recorded equipment value, not credits spent.
          Opponent loadout and game context are not controlled in these grouped
          rates.
        </p>
      </section>
      <p>
        <Link
          className="button"
          href={`/research?source=${source.slug}&team=${team}`}
        >
          Explore compositions and similar rounds ↗
        </Link>
      </p>
    </main>
  );
}
