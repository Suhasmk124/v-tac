import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { query } from "./db";
export type User = {
  id: number;
  email: string;
  role: "Head_Coach" | "Scout_Analyst";
};
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Set SESSION_SECRET with at least 32 random characters");
  return new TextEncoder().encode(secret);
}
export async function createSession(user: User) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set("vtac_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("vtac_session")?.value;
  if (!token) return null;
  let id: number;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id < 1) return null;
  } catch {
    return null;
  }
  return (
    (
      await query<User>("SELECT id,email,role FROM users WHERE id=$1", [id])
    )[0] ?? null
  );
}
export async function requireUser(coach = false) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (coach && user.role !== "Head_Coach")
    throw new Error("Head Coach access required");
  return user;
}
