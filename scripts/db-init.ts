import "dotenv/config";
import pg from "pg";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("CHANGE_ME"))
  throw new Error("Set DATABASE_URL in .env before initializing PostgreSQL.");
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-z][a-z0-9_]{0,62}$/.test(database))
  throw new Error(
    "Database name must be lowercase letters, digits, underscores.",
  );
url.pathname = "/postgres";
url.search = "";
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [database],
  );
  if (!exists.rowCount) {
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`Created database ${database}.`);
  } else console.log(`Database ${database} already exists.`);
} catch {
  console.error(
    "Database initialization failed. Check PostgreSQL service, credentials, port, and CREATE DATABASE permission.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
