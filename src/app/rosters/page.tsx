import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { updateRoster } from "../actions";
export default async function Rosters() {
  const user = await requireUser();
  if (user.role !== "Head_Coach") redirect("/forbidden");
  const players = await query(
    "SELECT p.id,p.handle,t.name team FROM players p LEFT JOIN teams t ON t.id=p.team_id ORDER BY p.handle",
  );
  const teams = await query("SELECT id,name FROM teams ORDER BY name");
  return (
    <main className="content">
      <Link className="back" href="/">
        ← Workspace
      </Link>
      <p className="eyebrow">COACH DESK</p>
      <h1>Team rosters</h1>
      <p className="subtle">
        Update current membership. Historical game rosters stay attached to
        their original teams.
      </p>
      <form action={updateRoster} className="panel controls">
        <label>
          Player
          <select name="player">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.handle} · {p.team ?? "Unassigned"}
              </option>
            ))}
          </select>
        </label>
        <label>
          New team
          <select name="team">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button>Update roster →</button>
      </form>
    </main>
  );
}
