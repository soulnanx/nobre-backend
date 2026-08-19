import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cartItems, products } from "../../db/schema.js";
import type { CartItem, Product } from "../../db/schema.js";

export type CartItemRow = {
  item: CartItem;
  product: Product;
};

export async function listForUser(userId: string): Promise<CartItemRow[]> {
  return db
    .select({ item: cartItems, product: products })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId));
}

export async function findForUserAndProduct(
  userId: string,
  productId: string,
): Promise<CartItem | undefined> {
  const [row] = await db
    .select()
    .from(cartItems)
    .where(
      and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)),
    )
    .limit(1);
  return row;
}

export async function upsertQty(
  userId: string,
  productId: string,
  qty: number,
): Promise<void> {
  const existing = await findForUserAndProduct(userId, productId);
  if (existing) {
    await db
      .update(cartItems)
      .set({ qty })
      .where(
        and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)),
      );
    return;
  }
  await db.insert(cartItems).values({ userId, productId, qty });
}

export async function incrementQty(
  userId: string,
  productId: string,
  delta: number,
): Promise<number> {
  const existing = await findForUserAndProduct(userId, productId);
  const next = (existing?.qty ?? 0) + delta;
  await upsertQty(userId, productId, next);
  return next;
}

export async function removeItem(
  userId: string,
  productId: string,
): Promise<void> {
  await db
    .delete(cartItems)
    .where(
      and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)),
    );
}

export async function clearForUser(userId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
}

export async function cleanupExpiredItems(ttlDays: number): Promise<number> {
  const result = await db.execute(
    sql`DELETE FROM cart_items WHERE added_at < NOW() - INTERVAL '${sql.raw(String(ttlDays))} days'`,
  );
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
