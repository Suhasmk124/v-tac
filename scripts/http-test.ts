import "dotenv/config";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import pg from "pg";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const token = async (id: number) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(id))
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
const page = async (path: string, id?: number) =>
  fetch(base + path, {
    headers: id ? { Cookie: `vtac_session=${await token(id)}` } : {},
    redirect: "manual",
  });
assert.match(await (await page("/")).text(), /SYNTHETIC PREVIEW/);
assert.equal((await page("/research")).status, 307);
assert.equal((await page("/rosters", 2)).headers.get("location"), "/forbidden");
const forged = await fetch(base + "/research", {
  headers: { Cookie: "vtac_session=not-a-valid-session" },
  redirect: "manual",
});
assert.equal(forged.status, 307);
const coach = await (await page("/", 1)).text();
assert.match(coach, /Database connected/);
assert.match(coach, /Add team/);
const scout = await (await page("/", 2)).text();
assert.doesNotMatch(scout, /Add team →/);
for (const path of [
  "/research?round=1&map=1&team=2",
  "/games/1",
  "/rounds/1",
  "/library",
  "/scouting",
  "/data",
]) {
  const response = await page(path, 1);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /Connection interrupted/);
  assert.match(html, /<main/);
}
const research = await (await page("/research", 2)).text();
assert.match(research, /Sign in as a Head Coach/);
const crossMap = await (await page("/research?round=1&map=2", 1)).text();
assert.match(crossMap, /No comparable rounds/);
assert.equal((await page("/api/export")).status, 307);
const exported = await page("/api/export", 2);
assert.equal(exported.status, 200);
assert.match(exported.headers.get("content-type") ?? "", /text\/csv/);
assert.match(await exported.text(), /source_hs_pct/);
const admin = new pg.Client({
  connectionString: process.env.ADMIN_DATABASE_URL,
});
await admin.connect();
try {
  const real = (
    await admin.query(
      "SELECT r.id round_id,g.id game_id FROM game_rounds r JOIN match_games g ON g.id=r.game_id JOIN matches m ON m.id=g.match_id WHERE m.data_source='vct-reference' ORDER BY r.id LIMIT 1",
    )
  ).rows[0];
  if (real) {
    assert.match(
      await (
        await page("/research?source=vct-reference&round=1&map=1", 1)
      ).text(),
      /No comparable rounds/,
    );
    for (const path of [
      `/games/${real.game_id}`,
      `/rounds/${real.round_id}`,
      "/research?source=vct-reference",
      "/?source=vct-reference",
    ]) {
      const response = await page(path, 2);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.doesNotMatch(html, /Connection interrupted/);
    }
  }
  const gameHtml = await (await page("/games/1", 1)).text();
  const noteAction = gameHtml.match(/name="\$ACTION_ID_([^"]+)"/)?.[1];
  assert.ok(noteAction);
  const note = `HTTP check ${randomUUID()}`;
  const noteForm = new FormData();
  noteForm.set(`$ACTION_ID_${noteAction}`, "");
  noteForm.set("game", "1");
  noteForm.set("body", note);
  const forbidden = await fetch(base + "/games/1", {
    method: "POST",
    headers: { Cookie: `vtac_session=${await token(2)}`, Origin: base },
    body: noteForm,
    redirect: "manual",
  });
  assert.ok(forbidden.status >= 400);
  assert.equal(
    (
      await admin.query("SELECT count(*) FROM scouting_notes WHERE body=$1", [
        note,
      ])
    ).rows[0].count,
    "0",
  );
  try {
    const saved = await fetch(base + "/games/1", {
      method: "POST",
      headers: { Cookie: `vtac_session=${await token(1)}`, Origin: base },
      body: noteForm,
      redirect: "manual",
    });
    assert.equal(saved.status, 303);
    assert.equal(
      (
        await admin.query("SELECT count(*) FROM scouting_notes WHERE body=$1", [
          note,
        ])
      ).rows[0].count,
      "1",
    );
  } finally {
    await admin.query(
      "DELETE FROM scouting_notes WHERE game_id=1 AND body=$1",
      [note],
    );
  }
} finally {
  await admin.end();
}
const action = coach
  .match(/name="\$ACTION_ID_([^"]+)"/g)
  ?.map((x) => x.match(/\$ACTION_ID_([^"]+)/)![1]);
// The coach dashboard includes logout first, team creation second.
assert.ok(action && action.length >= 2);
const form = new FormData();
form.set(`$ACTION_ID_${action[1]}`, "");
form.set("name", "Forbidden scout write");
form.set("region", "APAC");
const denied = await fetch(base + "/", {
  method: "POST",
  headers: { Cookie: `vtac_session=${await token(2)}`, Origin: base },
  body: form,
  redirect: "manual",
});
assert.ok(denied.status >= 400, "Scout must not invoke coach action directly");
const login = await (await page("/login")).text();
const loginAction = login.match(/name="\$ACTION_ID_([^"]+)"/)?.[1];
assert.ok(loginAction);
const loginForm = new FormData();
loginForm.set(`$ACTION_ID_${loginAction}`, "");
loginForm.set("email", "coach@vtac.local");
const password = process.env.TEST_PASSWORD || process.env.SEED_PASSWORD;
loginForm.set("password", password || "incorrect-password");
const signed = await fetch(base + "/login", {
  method: "POST",
  headers: { Origin: base },
  body: loginForm,
  redirect: "manual",
});
assert.equal(signed.status, 303);
if (password) {
  assert.match(
    signed.headers.get("set-cookie") || "",
    /vtac_session=.+HttpOnly/i,
  );
  assert.equal(signed.headers.get("location"), "/");
} else assert.match(signed.headers.get("location") || "", /error=1/);
console.log(
  "HTTP checks passed: authentication, dataset boundaries, real and synthetic analytics, library/scouting/provenance, CSV export, coach notes and scout write rejection.",
);
