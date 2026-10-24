import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveSource } from "@/lib/scouting";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const p = await searchParams;
  const source = await resolveSource(p.source);
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(p.page);
  const event = z.coerce
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .catch(0)
    .parse(p.event);
  const map = z.coerce
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .catch(0)
    .parse(p.map);
  const q = (p.q ?? "").trim().slice(0, 80);
  const events = await query(
    "SELECT DISTINCT t.id,t.name FROM tournaments t JOIN matches m ON m.tournament_id=t.id WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const maps = await query(
    "SELECT DISTINCT p.id,p.name FROM maps p JOIN match_games g ON g.map_id=p.id JOIN matches m ON m.id=g.match_id WHERE m.data_source=$1 ORDER BY name",
    [source.slug],
  );
  const args = [source.slug, event, map, `%${q}%`];
  const filter = `FROM match_games g JOIN matches m ON m.id=g.match_id JOIN maps p ON p.id=g.map_id JOIN tournaments t ON t.id=m.tournament_id JOIN teams a ON a.id=m.team1_id JOIN teams b ON b.id=m.team2_id WHERE m.data_source=$1 AND ($2::int=0 OR t.id=$2) AND ($3::int=0 OR p.id=$3) AND (a.name ILIKE $4 OR b.name ILIKE $4)`;
  const total = Number(
    (await query("SELECT count(*) " + filter, args))[0].count,
  );
  const games = await query(
    "SELECT g.id,g.team1_score,g.team2_score,p.name map,t.name event,a.name team1,b.name team2,m.played_at " +
      filter +
      " ORDER BY m.played_at DESC,g.id DESC LIMIT 18 OFFSET $5",
    [...args, (page - 1) * 18],
  );
  const href = (n: number) =>
    "/library?" +
    new URLSearchParams({
      source: source.slug,
      event: String(event),
      map: String(map),
      q,
      page: String(n),
    }).toString();
  return (
    <main className="content">
      <Link className="back" href={`/?source=${source.slug}`}>
        ← Workspace
      </Link>
      <p className="eyebrow">MATCH LIBRARY / {source.name}</p>
      <h1>
        Find the match
        <br />
        <span>behind the numbers.</span>
      </h1>
      <form className="panel controls">
        <input type="hidden" name="source" value={source.slug} />
        <label>
          Team search
          <input name="q" defaultValue={q} maxLength={80} />
        </label>
        <label>
          Tournament
          <select name="event" defaultValue={event}>
            <option value="0">All tournaments</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Map
          <select name="map" defaultValue={map}>
            <option value="0">All maps</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button>Filter maps →</button>
      </form>
      <p className="subtle">
        {total} matching maps · Page {page} of{" "}
        {Math.max(1, Math.ceil(total / 18))}
      </p>
      {source.slug === "vct-reference" && (
        <div className="report-actions">
          <a className="button" href={`/api/export?event=${event}`}>
            Export player map stats ↓
          </a>
          <span className="subtle">
            Selected event · latest 5,000 player-map rows. Team and map search
            filters apply to this library, not the export.
          </span>
        </div>
      )}
      <div className="game-grid">
        {games.map((g) => (
          <Link className="panel game" href={`/games/${g.id}`} key={g.id}>
            <div className="map-art">
              <span>{g.map}</span>
              <i>{new Date(g.played_at).toISOString().slice(0, 10)}</i>
            </div>
            <div className="game-body">
              <small>{g.event}</small>
              <p>
                {g.team1}
                <b>{g.team1_score}</b>
              </p>
              <p>
                {g.team2}
                <b>{g.team2_score}</b>
              </p>
              <span>Review map →</span>
            </div>
          </Link>
        ))}
      </div>
      {!games.length && <p>No maps match those filters.</p>}
      <div className="pagination">
        {page > 1 && (
          <Link className="button" href={href(page - 1)}>
            ← Previous
          </Link>
        )}
        {page * 18 < total && (
          <Link className="button" href={href(page + 1)}>
            Next →
          </Link>
        )}
      </div>
    </main>
  );
}
