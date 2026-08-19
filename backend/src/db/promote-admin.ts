import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { users } from "./schema.js";

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("uso: npm run db:promote-admin -- <username>");
    process.exitCode = 1;
    return;
  }

  const updated = await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.username, username))
    .returning({ id: users.id, username: users.username, role: users.role });

  if (updated.length === 0) {
    console.error(`usuário não encontrado: ${username}`);
    process.exitCode = 1;
    return;
  }

  console.log(`usuário promovido: ${JSON.stringify(updated[0])}`);
}

main()
  .catch((error) => {
    console.error("falha ao promover admin:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
