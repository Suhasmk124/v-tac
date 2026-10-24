import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { addScoutingNote } from "@/app/actions";
export default async function Game({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) > 2147483647 || Number(id) < 1)
    notFound();
  const game = (
    await query(
      "SELECT g.*,mp.name map,a.name team1,b.name team2,m.team1_id,m.data_source,m.source_url,m.patch,m.veto,t.name event FROM match_games g JOIN maps mp ON mp.id=g.map_id JOIN matches m ON m.id=g.match_id JOIN tournaments t ON t.id=m.tournament_id JOIN teams a ON a.id=m.team1_id JOIN teams b ON b.id=m.team2_id WHERE g.id=$1",
      [id],
    )
  )[0];
  if (!game) notFound();
  const rounds = await query(
    "SELECT r.*,t.name winner FROM game_rounds r JOIN teams t ON t.id=r.winning_team_id WHERE game_id=$1 ORDER BY round_number",
    [id],
  );
  const roster = await query(
    "SELECT p.handle,t.name team,a.agent_name FROM game_rosters r JOIN players p ON p.id=r.player_id JOIN teams t ON t.id=r.team_id LEFT JOIN agent_picks a USING(game_id,player_id) WHERE r.game_id=$1 ORDER BY team,p.handle",
    [id],
  );
  const performance = await query(
    "SELECT s.*,p.handle,t.name team FROM player_game_stats s JOIN players p ON p.id=s.player_id JOIN teams t ON t.id=s.team_id WHERE s.game_id=$1 ORDER BY s.acs DESC NULLS LAST",
    [id],
  );
  const notes = await query(
    "SELECT n.id,n.body,n.created_at,u.email FROM scouting_notes n JOIN users u ON u.id=n.author_id WHERE game_id=$1 ORDER BY created_at DESC LIMIT 50",
    [id],
  );
  return (
    <main className="content">
      <Link className="back" href={`/library?source=${game.data_source}`}>
        ← Workspace
      </Link>
      <p className="eyebrow">MATCH LIBRARY / MAP {id}</p>
      <h1>{game.map}</h1>
      <h2>
        {game.team1} {game.team1_score} — {game.team2_score} {game.team2}
      </h2>
      <div className="notice">
        {game.event} · {game.data_source} · {game.patch ?? "Patch not recorded"}{" "}
        {game.source_url && (
          <a href={game.source_url} target="_blank" rel="noreferrer">
            · Original match ↗
          </a>
        )}
      </div>
      {game.veto?.length > 0 && (
        <details className="panel">
          <summary>Map veto history</summary>
          {game.veto.map((v: string, i: number) => (
            <p key={i}>{v}</p>
          ))}
        </details>
      )}
      <p className="subtle">
        Round results · mint indicates a win for {game.team1}
      </p>
      <div className="round-grid">
        {rounds.map((r) => (
          <Link
            title={`${r.winner} · ${r.win_condition}`}
            className={`round-chip ${r.winning_team_id !== game.team1_id ? "loss" : ""}`}
            key={r.id}
            href={`/rounds/${r.id}`}
          >
            R{r.round_number}
          </Link>
        ))}
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team at match</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.handle}>
                <td>{p.handle}</td>
                <td>{p.team}</td>
                <td>{p.agent_name ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {performance.length > 0 && (
        <section style={{ marginTop: 25 }}>
          <h2>Recorded player map statistics</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>K / D / A</th>
                  <th>ACS</th>
                  <th>ADR</th>
                  <th>HS %</th>
                  <th>KAST %</th>
                  <th>FK / FD</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p) => (
                  <tr key={p.player_id}>
                    <td>{p.handle}</td>
                    <td>{p.team}</td>
                    <td>
                      {p.kills ?? "—"} / {p.deaths ?? "—"} / {p.assists ?? "—"}
                    </td>
                    <td className="accent">{p.acs ?? "—"}</td>
                    <td>{p.adr ?? "—"}</td>
                    <td>{p.headshot_pct ?? "—"}</td>
                    <td>{p.kast ?? "—"}</td>
                    <td>
                      {p.first_kills ?? "—"} / {p.first_deaths ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="subtle">
            Published map-level statistics. HS% uses the publisher's metric and
            is not comparable to synthetic headshot-kill rate.
          </p>
        </section>
      )}
      <section id="notes" className="panel" style={{ marginTop: 25 }}>
        <p className="eyebrow">COACH NOTEBOOK</p>
        <h2>Scouting observations</h2>
        {user.role === "Head_Coach" && (
          <form action={addScoutingNote}>
            <input type="hidden" name="game" value={id} />
            <label>
              Observation
              <textarea name="body" required maxLength={2000} rows={4} />
            </label>
            <button>Save observation →</button>
          </form>
        )}
        {notes.map((n) => (
          <article className="note" key={n.id}>
            <p>{n.body}</p>
            <small>
              {n.email} · {new Date(n.created_at).toISOString().slice(0, 10)}
            </small>
          </article>
        ))}
        {!notes.length && (
          <p className="subtle">No observations saved for this map yet.</p>
        )}
      </section>
    </main>
  );
}
