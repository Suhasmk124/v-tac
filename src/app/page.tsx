import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demo } from "@/lib/demo";
import { addTeam, logout } from "./actions";
import { resolveSource } from "@/lib/scouting";
export const dynamic = "force-dynamic";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; source?: string }>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  const live = !!user;
  const source = live
    ? await resolveSource(params.source)
    : { slug: "synthetic", name: "Synthetic training fixtures" };
  const isReal = source.slug === "vct-reference";
  const sources = live
    ? await query(
        "SELECT d.* FROM data_sources d WHERE EXISTS(SELECT 1 FROM matches m WHERE m.data_source=d.slug) ORDER BY slug",
      )
    : [];
  const metrics = live
    ? (
        await query(
          `SELECT count(DISTINCT g.id) games,count(DISTINCT r.id) rounds,
           (SELECT count(DISTINCT gr.player_id) FROM game_rosters gr JOIN match_games gg ON gg.id=gr.game_id JOIN matches mm ON mm.id=gg.match_id WHERE mm.data_source=$1) players,
           count(DISTINCT e.round_id) events FROM matches m JOIN match_games g ON g.match_id=m.id LEFT JOIN game_rounds r ON r.game_id=g.id LEFT JOIN tactical_embeddings e ON e.round_id=r.id WHERE m.data_source=$1`,
          [source.slug],
        )
      )[0]
    : { ...demo.metrics, events: 144 };
  const leaderboard = live
    ? isReal
      ? await query(
          `SELECT s.player_id,p.handle,p.role,count(*) maps,sum(s.rounds_played) rounds,sum(s.kills) kills,sum(s.deaths) deaths,round(sum(s.acs*s.rounds_played)/nullif(sum(s.rounds_played) FILTER(WHERE s.acs IS NOT NULL),0),1) acs,round(sum(s.adr*s.rounds_played)/nullif(sum(s.rounds_played) FILTER(WHERE s.adr IS NOT NULL),0),1) adr,NULL::numeric headshot_pct FROM player_game_stats s JOIN players p ON p.id=s.player_id JOIN match_games g ON g.id=s.game_id JOIN matches m ON m.id=g.match_id WHERE m.data_source=$1 GROUP BY s.player_id,p.handle,p.role HAVING count(*)>=3 ORDER BY acs DESC NULLS LAST LIMIT 8`,
          [source.slug],
        )
      : await query(
          "SELECT * FROM mv_player_leaderboards ORDER BY acs DESC LIMIT 8",
        )
    : demo.leaderboard;
  const games = live
    ? await query(
        "SELECT g.*,mp.name map,a.name team1,b.name team2,t.name event FROM match_games g JOIN maps mp ON mp.id=g.map_id JOIN matches m ON m.id=g.match_id JOIN tournaments t ON t.id=m.tournament_id JOIN teams a ON a.id=m.team1_id JOIN teams b ON b.id=m.team2_id WHERE m.data_source=$1 ORDER BY m.played_at DESC,g.id DESC LIMIT 8",
        [source.slug],
      )
    : demo.games;
  const alerts = live
    ? !isReal
      ? await query(
          "SELECT a.id,a.observed_damage,p.handle FROM alerts a JOIN player_round_stats s ON s.id=a.stat_id JOIN players p ON p.id=s.player_id ORDER BY a.id DESC LIMIT 4",
        )
      : []
    : [];
  return (
    <div className="shell">
      <aside>
        <Link href="/" className="brand">
          V<span>—</span>TAC
        </Link>
        <small>COACHING WORKSPACE</small>
        <nav>
          <a className="active" href="#overview">
            ◈ Overview
          </a>
          <a href="#matches">▦ Match library</a>
          <a href="#leaderboard">↗ Player intelligence</a>
          <Link href={`/library?source=${source.slug}`}>
            ▤ Full match library
          </Link>
          <Link href={`/scouting?source=${source.slug}`}>
            ⚔ Opponent scouting
          </Link>
          <Link href={`/research?source=${source.slug}`}>◎ Tactical lab</Link>
          <Link href="/data">◉ Data observatory</Link>
          <a href="#management">⚑ Team management</a>
          {user?.role === "Head_Coach" && (
            <Link href="/rosters">⇄ Player rosters</Link>
          )}
        </nav>
        <div className="aside-bottom">
          <span className="status-dot" />{" "}
          {live ? "Database connected" : "Synthetic demo"}
          <p>{user?.role.replaceAll("_", " ") ?? "Preview workspace"}</p>
          {live ? (
            <form action={logout}>
              <button className="quiet">Sign out</button>
            </form>
          ) : (
            <Link href="/login">Sign in →</Link>
          )}
        </div>
      </aside>
      <main id="overview">
        <header>
          <span>
            WORKSPACE <b>/ Overview</b>
          </span>
          <span className="pill">RESEARCH BUILD · V0.2</span>
        </header>
        <section className="hero">
          <div>
            <p className="eyebrow">YOUR NEXT ADVANTAGE</p>
            <h1>
              Every round tells a story.
              <br />
              <span>Find the winning pattern.</span>
            </h1>
            <p>Turn match history into a sharper game plan.</p>
            <Link className="button" href={`/scouting?source=${source.slug}`}>
              Prepare for an opponent ↗
            </Link>
          </div>
          <div className="hero-mark" aria-hidden="true">
            V<span>/</span>
          </div>
        </section>
        <div className="notice">
          {live
            ? `Database connected · ${source.name}. ${isReal ? "Public match records; player statistics are per map. Position telemetry is unavailable." : "Generated demonstration telemetry."}`
            : "SYNTHETIC PREVIEW · Example dashboard values. Sign in to explore the database, search rounds and manage teams."}
        </div>
        {live && (
          <form className="source-picker">
            <label>
              Active dataset
              <select name="source" defaultValue={source.slug}>
                {sources.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button>Switch dataset →</button>
          </form>
        )}
        <section className="metrics">
          {[
            ["Maps analyzed", metrics.games],
            ["Rounds indexed", metrics.rounds],
            ["Players tracked", metrics.players],
            ["Vectorized rounds", metrics.events],
          ].map(([label, n]) => (
            <article className="panel" key={label}>
              <p>{label}</p>
              <strong>{Number(n).toLocaleString()}</strong>
              <small>Across the match library</small>
            </article>
          ))}
        </section>
        <section id="matches">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE MATCH ROOM</p>
              <h2>Recent maps</h2>
            </div>
            <span>Explore round-by-round telemetry</span>
          </div>
          <div className="game-grid">
            {games.map((g) => (
              <Link
                href={live ? `/games/${g.id}` : "/login"}
                className="panel game"
                key={g.id}
              >
                <div className="map-art">
                  <span>{g.map}</span>
                  <i>MAP / 0{g.id}</i>
                </div>
                <div className="game-body">
                  <small>
                    {"event" in g ? g.event : "SYNTHETIC INVITATIONAL"}
                  </small>
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
        </section>
        <section id="leaderboard">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PERFORMANCE SIGNALS</p>
              <h2>Player leaderboard</h2>
            </div>
            <span>
              {isReal
                ? "Round-weighted source ACS / ADR · 3+ maps"
                : "Materialized tournament statistics"}
            </span>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Role</th>
                  <th>Rounds</th>
                  <th>K / D</th>
                  <th>ACS</th>
                  <th>ADR</th>
                  <th>HS %</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={`${p.player_id}-${i}`}>
                    <td>
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p.handle}
                    </td>
                    <td>{p.role}</td>
                    <td>{p.rounds}</td>
                    <td>
                      {p.kills} / {p.deaths}
                    </td>
                    <td className="accent">{p.acs ?? "—"}</td>
                    <td>{p.adr ?? "—"}</td>
                    <td>
                      {p.headshot_pct == null ? "—" : `${p.headshot_pct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isReal && (
            <p className="subtle">
              HS% is available on individual map reviews. A season average is
              withheld because the dataset does not include hit denominators.
              Source ACS and ADR are rounded map averages weighted by rounds.
            </p>
          )}
        </section>
        <section className="lower-grid" id="management">
          <article className="panel">
            <p className="eyebrow">COACH DESK</p>
            <h2>Build your match room</h2>
            {params.saved && <p role="status">Team saved.</p>}
            {user?.role === "Head_Coach" ? (
              <form action={addTeam}>
                <label>
                  Team name
                  <input name="name" required minLength={2} maxLength={80} />
                </label>
                <label>
                  Region
                  <select name="region">
                    {["APAC", "EMEA", "Americas", "China"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <button>Add team →</button>
              </form>
            ) : (
              <p>
                Head Coaches can add teams. Scouts can explore all analytics
                with read access.
              </p>
            )}
          </article>
          <article className="panel">
            <p className="eyebrow">ANOMALY WATCH</p>
            <h2>Performance alerts</h2>
            {isReal ? (
              <p>
                Individual round damage is not available in this public export,
                so damage anomaly alerts are unavailable. The synthetic
                workspace demonstrates that database trigger.
              </p>
            ) : alerts.length ? (
              alerts.map((a) => (
                <p key={a.id}>
                  {a.handle}: {a.observed_damage} damage exceeded the baseline
                  threshold.
                </p>
              ))
            ) : (
              <p>
                No alerts to review. The database flags damage more than three
                standard deviations from a player’s tournament baseline, after
                10 observations.
              </p>
            )}
          </article>
        </section>
        <footer>
          V-TAC / ESPORTS INTELLIGENCE{" "}
          <span>
            Independent academic project · Not affiliated with Riot Games
          </span>
        </footer>
      </main>
    </div>
  );
}
