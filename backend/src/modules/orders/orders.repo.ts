import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  cartItems,
  orderItems,
  orders,
  products,
} from "../../db/schema.js";
import type { Order, OrderItem } from "../../db/schema.js";

class EmptyCartError extends Error {}
class InsufficientStockError extends Error {}

export type OrderWithItems = Order & { items: OrderItem[] };

export async function listForUser(userId: string): Promise<OrderWithItems[]> {
  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  if (userOrders.length === 0) return [];

  const orderIds = userOrders.map((order) => order.id);
  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  return userOrders.map((order) => ({
    ...order,
    items: allItems.filter((item) => item.orderId === order.id),
  }));
}

export async function findByIdForUser(
  id: string,
  userId: string,
): Promise<OrderWithItems | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.userId, userId)))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, items };
}

export type CheckoutResult =
  | { ok: true; order: OrderWithItems }
  | { ok: false; error: "empty-cart" | "stock" };

export async function checkoutFromCart(userId: string): Promise<CheckoutResult> {
  try {
    const order = await db.transaction(async (tx) => {
      const cart = await tx
        .select({
          productId: cartItems.productId,
          qty: cartItems.qty,
        })
        .from(cartItems)
        .where(eq(cartItems.userId, userId));

      if (cart.length === 0) {
        throw new EmptyCartError();
      }

      const productIds = cart.map((item) => item.productId);
      const productsRows = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds));

      let totalCents = 0;
      for (const item of cart) {
        const product = productsRows.find((p) => p.id === item.productId);
        if (!product || item.qty > product.stockQty) {
          throw new InsufficientStockError();
        }
        totalCents += item.qty * product.priceCents;
      }

      for (const item of cart) {
        const product = productsRows.find((p) => p.id === item.productId)!;
        await tx
          .update(products)
          .set({ stockQty: product.stockQty - item.qty })
          .where(eq(products.id, product.id));
      }

      const [created] = await tx
        .insert(orders)
        .values({ userId, totalCents })
        .returning();
      if (!created) throw new Error("failed to create order");

      const items = await tx
        .insert(orderItems)
        .values(
          cart.map((item) => {
            const product = productsRows.find((p) => p.id === item.productId)!;
            return {
              orderId: created.id,
              productId: product.id,
              name: product.name,
              unitPriceCents: product.priceCents,
              qty: item.qty,
            };
          }),
        )
        .returning();

      await tx.delete(cartItems).where(eq(cartItems.userId, userId));

      return { ...created, items };
    });

    return { ok: true, order };
  } catch (error) {
    if (error instanceof EmptyCartError) {
      return { ok: false, error: "empty-cart" };
    }
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: "stock" };
    }
    throw error;
  }
}
