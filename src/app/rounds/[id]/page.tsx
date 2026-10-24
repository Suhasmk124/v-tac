import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
export default async function Round({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) > 2147483647 || Number(id) < 1)
    notFound();
  const r = (
    await query(
      "SELECT r.*,t.name winner,mp.name map,g.map_id,m.data_source FROM game_rounds r JOIN teams t ON t.id=r.winning_team_id JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id JOIN maps mp ON mp.id=g.map_id WHERE r.id=$1",
      [id],
    )
  )[0];
  if (!r) notFound();
  if (r.data_source === "vct-reference") {
    const economy = await query(
      "SELECT e.*,t.name team FROM team_round_economy e JOIN teams t ON t.id=e.team_id WHERE round_id=$1 ORDER BY t.name",
      [id],
    );
    return (
      <main className="content">
        <Link className="back" href={`/games/${r.game_id}`}>
          ← Map review
        </Link>
        <p className="eyebrow">
          {r.map} / ROUND {r.round_number} / PUBLIC RECORD
        </p>
        <h1>{r.winner} takes it.</h1>
        <p className="subtle">
          {r.win_condition} · Reference ID {r.id}
        </p>
        <Link
          className="button"
          href={`/research?source=vct-reference&round=${r.id}&map=${r.map_id}`}
        >
          Find similar economy rounds ↗
        </Link>
        <section className="panel" style={{ marginTop: 25 }}>
          <h2>Recorded team economy</h2>
          {economy.length ? (
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Side</th>
                  <th>Loadout value</th>
                  <th>Bank</th>
                </tr>
              </thead>
              <tbody>
                {economy.map((e) => (
                  <tr key={e.team_id}>
                    <td>{e.team}</td>
                    <td>
                      {r.attacking_team_id == null
                        ? "Unknown"
                        : e.team_id === r.attacking_team_id
                          ? "Attack"
                          : "Defense"}
                    </td>
                    <td>{e.loadout_value ?? "Not recorded"}</td>
                    <td>{e.bank ?? "Not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Economy was not recorded for this round.</p>
          )}
        </section>
        <div className="notice" style={{ marginTop: 25 }}>
          This public dataset does not provide player-round damage, timed kill
          events or coordinates. These details are unavailable for this round.
          Loadout is equipment value, not credits spent.
        </div>
      </main>
    );
  }
  const stats = await query(
    "SELECT s.*,p.handle,t.name team FROM player_round_stats s JOIN players p ON p.id=s.player_id JOIN game_rosters gr ON gr.game_id=s.game_id AND gr.player_id=s.player_id JOIN teams t ON t.id=gr.team_id WHERE s.round_id=$1 ORDER BY team,p.handle",
    [id],
  );
  const kills = await query(
    "SELECT k.*,p.handle killer,v.handle victim FROM kill_events k JOIN players p ON p.id=k.killer_id JOIN players v ON v.id=k.victim_id WHERE round_id=$1 ORDER BY seconds_elapsed,id",
    [id],
  );
  return (
    <main className="content">
      <Link className="back" href={`/games/${r.game_id}`}>
        ← Map review
      </Link>
      <p className="eyebrow">
        {r.map} / ROUND {r.round_number}
      </p>
      <h1>{r.winner} takes it.</h1>
      <p className="subtle">
        {r.win_condition} · Reference ID {r.id}
      </p>
      <Link className="button" href={`/research?round=${r.id}&map=${r.map_id}`}>
        Find similar rounds ↗
      </Link>
      <div className="lower-grid">
        <section className="panel">
          <h2>Kill locations</h2>
          <div
            className="heatmap"
            role="img"
            aria-label={`${kills.filter((k) => k.x !== null).length} normalized kill locations on an abstract coordinate grid`}
          >
            <span>ABSTRACT GRID · NOT MAP GEOMETRY</span>
            {kills
              .filter((k) => k.x !== null)
              .map((k) => (
                <i
                  key={k.id}
                  title={`${k.killer} → ${k.victim}`}
                  style={{
                    left: `${Number(k.x) * 100}%`,
                    top: `${Number(k.y) * 100}%`,
                  }}
                />
              ))}
          </div>
          <p className="subtle">
            Normalized locations; missing coordinates are excluded.
          </p>
        </section>
        <section className="panel">
          <h2>Event timeline</h2>
          {kills.map((k) => (
            <p key={k.id}>
              <small>{k.seconds_elapsed}s</small> {k.killer} → {k.victim}
              <br />
              <small>
                {k.weapon_used}
                {k.is_headshot ? " · HEADSHOT" : ""}
              </small>
            </p>
          ))}
          {!kills.length && <p>No event telemetry available.</p>}
        </section>
      </div>
      <h2 style={{ marginTop: 30 }}>Round economy and performance</h2>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>K / D / A</th>
              <th>Damage</th>
              <th>Credits</th>
              <th>Spent</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.id}>
                <td>{s.handle}</td>
                <td>{s.team}</td>
                <td>
                  {s.kills} / {s.deaths} / {s.assists}
                </td>
                <td>{s.damage}</td>
                <td>{s.economy_credits}</td>
                <td>{s.credits_spent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
