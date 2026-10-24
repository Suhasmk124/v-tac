import "dotenv/config";
import { hash } from "bcryptjs";
import pg from "pg";
import { z } from "zod";
const email = z.email().parse(process.env.NEW_USER_EMAIL).toLowerCase();
const role = z
  .enum(["Head_Coach", "Scout_Analyst"])
  .parse(process.env.NEW_USER_ROLE);
const password = z
  .string()
  .min(12)
  .max(128)
  .parse(process.env.NEW_USER_PASSWORD);
if (Buffer.byteLength(password, "utf8") > 72)
  throw new Error("Bcrypt passwords must be at most 72 UTF-8 bytes");
if (!process.env.ADMIN_DATABASE_URL) throw new Error("Set ADMIN_DATABASE_URL");
const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await c.connect();
try {
  await c.query(
    "INSERT INTO users(email,role,password_hash) VALUES($1,$2,$3)",
    [email, role, await hash(password, 12)],
  );
  console.log("Created user", email, role);
} finally {
  await c.end();
}
