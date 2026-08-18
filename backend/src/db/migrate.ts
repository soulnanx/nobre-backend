import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

async function main() {
  const migrationsFolder = process.env.MIGRATIONS_DIR
    ?? new URL("./migrations", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  console.log("migrações aplicadas");
}

main()
  .catch((error) => {
    console.error("falha na migração:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
