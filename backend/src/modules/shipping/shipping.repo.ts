import { like } from "drizzle-orm";
import { db } from "../../db/client.js";
import { shippingRules } from "../../db/schema.js";

export async function findRuleByCep(cep: string): Promise<number | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length < 2) return null;
  const prefix = digits.slice(0, 2);
  const rows = await db
    .select()
    .from(shippingRules)
    .where(like(shippingRules.cepPrefix, `${prefix}%`));
  if (rows.length === 0) return null;
  const exact = rows.find((r) => r.cepPrefix === prefix);
  if (exact) return exact.priceCents;
  return rows[0]?.priceCents ?? null;
}
