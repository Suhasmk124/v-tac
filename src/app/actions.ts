"use server";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSession, requireUser, type User } from "@/lib/auth";
// Modest local protection; use a shared rate limiter before exposing multiple instances.
const attempts = new Map<string, { count: number; until: number }>();
export async function login(form: FormData) {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/login?error=1");
  if (Buffer.byteLength(parsed.data.password, "utf8") > 72)
    redirect("/login?error=1");
  const email = parsed.data.email.toLowerCase();
  const entry = attempts.get(email);
  if (entry && entry.until > Date.now() && entry.count >= 5)
    redirect("/login?error=1");
  if (attempts.size > 10000)
    for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
  if (!entry && attempts.size >= 10000) redirect("/login?error=1");
  attempts.set(email, {
    count: entry && entry.until > Date.now() ? entry.count + 1 : 1,
    until:
      entry && entry.until > Date.now() ? entry.until : Date.now() + 900000,
  });
  const user = (
    await query<User & { password_hash: string }>(
      "SELECT id,email,role,password_hash FROM users WHERE email=$1",
      [email],
    )
  )[0];
  // Equal-cost comparison for unknown accounts.
  const valid = await compare(
    parsed.data.password,
    user?.password_hash ??
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
  );
  if (!user || !valid) redirect("/login?error=1");
  attempts.delete(email);
  await createSession(user);
  redirect("/");
}
export async function logout() {
  (await cookies()).delete("vtac_session");
  redirect("/login");
}
export async function addTeam(form: FormData) {
  await requireUser(true);
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      region: z.enum(["APAC", "EMEA", "Americas", "China"]),
    })
    .parse(Object.fromEntries(form));
  await query(
    "INSERT INTO teams(name,region) VALUES($1,$2) ON CONFLICT(name) DO NOTHING",
    [data.name, data.region],
  );
  revalidatePath("/");
  redirect("/?saved=1");
}
export async function updateRoster(form: FormData) {
  await requireUser(true);
  const data = z
    .object({
      player: z.coerce.number().int().positive(),
      team: z.coerce.number().int().positive(),
    })
    .parse(Object.fromEntries(form));
  await query("UPDATE players SET team_id=$1 WHERE id=$2", [
    data.team,
    data.player,
  ]);
  revalidatePath("/");
  redirect("/?saved=1");
}
export async function addScoutingNote(form: FormData) {
  const user = await requireUser(true);
  const data = z
    .object({
      game: z.coerce.number().int().positive().max(2147483647),
      body: z.string().trim().min(1).max(2000),
    })
    .parse(Object.fromEntries(form));
  await query(
    "INSERT INTO scouting_notes(game_id,author_id,body) VALUES($1,$2,$3)",
    [data.game, user.id, data.body],
  );
  revalidatePath(`/games/${data.game}`);
  redirect(`/games/${data.game}#notes`);
}
