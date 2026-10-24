import "dotenv/config";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
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
]) {
  const response = await page(path, 1);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /Connection interrupted/);
  assert.match(html, /<main/);
}
const research = await (await page("/research", 2)).text();
assert.match(research, /Sign in as a Head Coach/);
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
  "HTTP checks passed: preview, protected routes, live analytics, role visibility, forged scout write denial and login.",
);
