import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { coupons } from "../../db/schema.js";
import type { Coupon } from "../../db/schema.js";

export async function findByCode(code: string): Promise<Coupon | undefined> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code))
    .limit(1);
  return row;
}
