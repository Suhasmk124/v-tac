import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.ADMIN_DATABASE_URL,
});
if (!process.env.ADMIN_DATABASE_URL) throw new Error("Set ADMIN_DATABASE_URL");
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  const name = "001_schema.sql";
  if (
    !(
      await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
        name,
      ])
    ).rowCount
  ) {
    await client.query(await readFile(`db/${name}`, "utf8"));
    await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
      name,
    ]);
    console.log("Applied", name);
  } else console.log("Schema already current");
} finally {
  await client.end();
}
