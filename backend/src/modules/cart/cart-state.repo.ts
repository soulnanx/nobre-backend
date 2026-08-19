import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { addresses, cartUserState, coupons } from "../../db/schema.js";
import type { Address, CartUserState, Coupon } from "../../db/schema.js";

export async function getCartUserState(
  userId: string,
): Promise<CartUserState | undefined> {
  const [row] = await db
    .select()
    .from(cartUserState)
    .where(eq(cartUserState.userId, userId))
    .limit(1);
  return row;
}

export async function getCouponById(id: string): Promise<Coupon | undefined> {
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return row;
}

export async function getAddressById(id: string): Promise<Address | undefined> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(eq(addresses.id, id))
    .limit(1);
  return row;
}

export async function upsertCoupon(
  userId: string,
  couponId: string | null,
): Promise<void> {
  await db
    .insert(cartUserState)
    .values({ userId, couponId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: cartUserState.userId,
      set: { couponId, updatedAt: new Date() },
    });
}

export async function upsertShippingAddress(
  userId: string,
  addressId: string | null,
): Promise<void> {
  await db
    .insert(cartUserState)
    .values({ userId, shippingAddressId: addressId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: cartUserState.userId,
      set: { shippingAddressId: addressId, updatedAt: new Date() },
    });
}

export type CreateAddressInput = {
  userId: string;
  cep: string;
  street: string;
  number: string;
  city: string;
  state: string;
  complement: string | null;
};

export async function createAddress(input: CreateAddressInput): Promise<Address> {
  const [row] = await db.insert(addresses).values(input).returning();
  if (!row) throw new Error("createAddress failed");
  return row;
}
