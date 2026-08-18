import type { Cart, CartItem as CartItemDTO } from "../../types/dto.js";
import type { CartItemRow } from "./cart.repo.js";
import * as repo from "./cart.repo.js";
import * as productRepo from "../products/products.repo.js";

export type AddResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "stock" };

export type UpdateResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "stock" };

function toDTO(row: CartItemRow): CartItemDTO {
  return {
    id: row.item.id,
    userId: row.item.userId,
    productId: row.item.productId,
    qty: row.item.qty,
    product: {
      id: row.product.id,
      name: row.product.name,
      description: row.product.description,
      priceCents: row.product.priceCents,
      color: row.product.color,
      stockQty: row.product.stockQty,
      active: row.product.active,
      createdAt: row.product.createdAt.toISOString(),
    },
  };
}

export async function getCart(userId: string): Promise<Cart> {
  const rows = await repo.listForUser(userId);
  const items = rows.map(toDTO);
  const totalCents = items.reduce(
    (sum, item) => sum + item.qty * item.product.priceCents,
    0,
  );
  return { items, totalCents };
}

export async function addItem(
  userId: string,
  productId: string,
  qty: number,
): Promise<AddResult> {
  const product = await productRepo.findById(productId);
  if (!product) return { ok: false, error: "not-found" };

  const existing = await repo.findForUserAndProduct(userId, productId);
  const nextQty = (existing?.qty ?? 0) + qty;
  if (nextQty > product.stockQty) return { ok: false, error: "stock" };

  await repo.upsertQty(userId, productId, nextQty);
  return { ok: true };
}

export async function updateItemQty(
  userId: string,
  productId: string,
  qty: number,
): Promise<UpdateResult> {
  const existing = await repo.findForUserAndProduct(userId, productId);
  if (!existing) return { ok: false, error: "not-found" };

  const product = await productRepo.findById(productId);
  if (!product) return { ok: false, error: "not-found" };
  if (qty > product.stockQty) return { ok: false, error: "stock" };

  await repo.upsertQty(userId, productId, qty);
  return { ok: true };
}

export async function removeItem(
  userId: string,
  productId: string,
): Promise<void> {
  await repo.removeItem(userId, productId);
}

export async function clearCart(userId: string): Promise<void> {
  await repo.clearForUser(userId);
}
