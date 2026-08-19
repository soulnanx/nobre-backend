import { pool } from "./client.js";
import { cleanupExpiredItems } from "../modules/cart/cart.repo.js";
import { env } from "../config/index.js";

async function main() {
  const removed = await cleanupExpiredItems(env.CART_TTL_DAYS);
  console.log(
    `cleanup: ${removed} item(ns) removido(s) (TTL=${env.CART_TTL_DAYS} dia(s))`,
  );
}

main()
  .catch((error) => {
    console.error("falha no cleanup:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
