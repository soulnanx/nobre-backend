import { db, pool } from "./client.js";
import { coupons } from "./schema.js";

const seedCoupons = [
  {
    code: "BEMVINDO10",
    discountType: "percent",
    discountValue: 10,
    minSubtotalCents: null,
    expiresAt: null,
  },
  {
    code: "FRETE0",
    discountType: "fixed",
    discountValue: 1500,
    minSubtotalCents: 20000,
    expiresAt: null,
  },
];

async function main() {
  const existing = await db.select({ code: coupons.code }).from(coupons);
  const existingCodes = new Set(existing.map((c) => c.code));
  const toInsert = seedCoupons.filter((c) => !existingCodes.has(c.code));
  if (toInsert.length === 0) {
    console.log("cupons já presentes, seed ignorado");
    return;
  }
  const inserted = await db
    .insert(coupons)
    .values(toInsert)
    .returning({ code: coupons.code });
  console.log(`seed aplicado: ${inserted.length} cupom(ns) (${inserted.map((c) => c.code).join(", ")})`);
}

main()
  .catch((error) => {
    console.error("falha no seed de cupons:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
