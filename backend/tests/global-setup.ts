import pg from "pg";

const ADMIN_URL =
  process.env.TEST_DB_ADMIN_URL ?? "postgres://loja:loja@localhost:5433/loja";
const TEST_DB_NAME = "loja_test";
const TEST_URL = `postgres://loja:loja@localhost:5433/${TEST_DB_NAME}`;

export default async function globalSetup() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();

  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [TEST_DB_NAME],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  }
  await client.end();

  process.env.DATABASE_URL = TEST_URL;
  process.env.PORT = "3999";

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, pool } = await import("../src/db/client.js");
  await migrate(db, {
    migrationsFolder: new URL("../src/db/migrations", import.meta.url).pathname,
  });
  await pool.end();
}
