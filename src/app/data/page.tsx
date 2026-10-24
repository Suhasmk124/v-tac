import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Data() {
  await requireUser();
  const sources = await query(
    `SELECT d.*,count(DISTINCT m.id) matches,count(DISTINCT g.id) games,count(DISTINCT r.id) rounds,count(DISTINCT e.round_id) vectors,count(DISTINCT g.id) FILTER(WHERE c.economy) economy_maps FROM data_sources d LEFT JOIN matches m ON m.data_source=d.slug LEFT JOIN match_games g ON g.match_id=m.id LEFT JOIN map_coverage c ON c.game_id=g.id LEFT JOIN game_rounds r ON r.game_id=g.id LEFT JOIN tactical_embeddings e ON e.round_id=r.id GROUP BY d.slug ORDER BY d.slug`,
  );
  const imports = await query(
    "SELECT * FROM data_imports ORDER BY imported_at DESC LIMIT 10",
  );
  return (
    <main className="content">
      <Link className="back" href="/">
        ← Workspace
      </Link>
      <p className="eyebrow">DATA OBSERVATORY</p>
      <h1>Know your evidence.</h1>
      <p className="subtle">
        Real records and generated fixtures are kept separate. Missing telemetry
        stays missing.
      </p>
      <div className="game-grid">
        {sources.map((s) => (
          <article className="panel" key={s.slug}>
            <p className="eyebrow">{s.slug}</p>
            <h2>{s.name}</h2>
            <p>{s.description}</p>
            <p className="accent">
              {s.matches} matches · {s.games} maps · {s.rounds} rounds
            </p>
            <p className="subtle">
              {s.vectors} vectorized rounds · {s.economy_maps} maps with
              complete recorded economy
            </p>
            <a href={s.url} target="_blank" rel="noreferrer">
              Source ↗
            </a>
            {s.terms_url && (
              <>
                {" "}
                ·{" "}
                <a href={s.terms_url} target="_blank" rel="noreferrer">
                  Source terms ↗
                </a>
              </>
            )}
            <p>
              <Link href={`/?source=${s.slug}`}>Explore this dataset →</Link>
            </p>
          </article>
        ))}
      </div>
      <div className="notice" style={{ marginTop: 25 }}>
        The public snapshot contains player statistics per map and team economy
        per round. It does not contain individual player-round damage, weapon
        events or coordinates. Real rounds use a separate economy-only feature
        version; spatial plots remain available for the synthetic fixtures.
      </div>
      <h2>Import history</h2>
      {imports.length ? (
        imports.map((i) => (
          <article className="panel" key={i.id}>
            <p>
              {i.source_slug} · {new Date(i.imported_at).toISOString()}
            </p>
            <p className="subtle">Selection: {i.selection}</p>
            <p className="fingerprint">SHA-256: {i.sha256}</p>
            <p>
              {i.counts.matches} new matches · {i.counts.games} maps ·{" "}
              {i.counts.rounds} rounds
            </p>
          </article>
        ))
      ) : (
        <p>
          No public snapshot imported yet. Follow the dataset instructions in
          the README.
        </p>
      )}
      <p className="subtle">
        Snapshot files are downloaded locally and excluded from Git. The
        importer records their fingerprint and selection, and skips previously
        imported matches.
      </p>
    </main>
  );
}
