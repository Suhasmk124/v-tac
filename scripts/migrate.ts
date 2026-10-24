import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
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
  await client.query("SELECT pg_advisory_lock(864202)");
  const files = (await readdir("db"))
    .filter(
      (name) => /^\d+_.*\.sql$/.test(name) && !name.includes("vector_index"),
    )
    .sort();
  for (const name of files) {
    if (
      !(
        await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    ) {
      await client.query("BEGIN");
      try {
        const sql = (await readFile(`db/${name}`, "utf8"))
          .replace(/^BEGIN;\s*/, "")
          .replace(/COMMIT;\s*$/, "");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        await client.query("COMMIT");
        console.log("Applied", name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} finally {
  await client.end();
}
