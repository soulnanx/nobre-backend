import type {
  Cart,
  CartItem as CartItemDTO,
  PublicAddress,
  PublicCoupon,
} from "../../types/dto.js";
import type { CartItemRow } from "./cart.repo.js";
import * as repo from "./cart.repo.js";
import * as stateRepo from "./cart-state.repo.js";
import * as productRepo from "../products/products.repo.js";
import * as couponsService from "../coupons/coupons.service.js";
import * as shippingService from "../shipping/shipping.service.js";
import { env } from "../../config/index.js";

export type AddResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "stock" };

export type UpdateResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "stock" };

export type CouponResult =
  | { ok: true }
  | { ok: false; error: "invalid-coupon" };

export type AddressInput = {
  cep: string;
  street: string;
  number: string;
  city: string;
  state: string;
  complement: string | null;
};

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

function couponToDTO(coupon: {
  code: string;
  discountType: string;
  discountValue: number;
  expiresAt: Date | null;
}): PublicCoupon {
  return {
    code: coupon.code,
    discountType: coupon.discountType as PublicCoupon["discountType"],
    discountValue: coupon.discountValue,
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
  };
}

function addressToDTO(address: {
  id: string;
  cep: string;
  street: string;
  number: string;
  city: string;
  state: string;
  complement: string | null;
}): PublicAddress {
  return {
    id: address.id,
    cep: address.cep,
    street: address.street,
    number: address.number,
    city: address.city,
    state: address.state,
    complement: address.complement,
  };
}

export async function getCart(userId: string): Promise<Cart> {
  await repo.cleanupExpiredItems(env.CART_TTL_DAYS);
  const rows = await repo.listForUser(userId);
  const items = rows.map(toDTO);
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.qty * item.product.priceCents,
    0,
  );

  const state = await stateRepo.getCartUserState(userId);
  let discountCents = 0;
  let coupon: PublicCoupon | null = null;
  if (state?.couponId) {
    const c = await stateRepo.getCouponById(state.couponId);
    if (c && c.active && (!c.expiresAt || c.expiresAt.getTime() > Date.now())) {
      coupon = couponToDTO(c);
      discountCents = couponsService.computeDiscount(c, subtotalCents);
    }
  }

  let shippingAddress: PublicAddress | null = null;
  let shippingCents = 0;
  if (state?.shippingAddressId) {
    const a = await stateRepo.getAddressById(state.shippingAddressId);
    if (a) {
      shippingAddress = addressToDTO(a);
      shippingCents = await shippingService.quote(a.cep, subtotalCents);
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  return {
    items,
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents,
    coupon,
    shippingAddress,
  };
}

function computeShippingForCepStub(cep: string, subtotalCents: number): number {
  const digits = cep.replace(/\D/g, "");
  if (digits.length < 2) return 0;
  const prefix = digits.slice(0, 2);
  const table: Record<string, number> = {
    "01": 1500,
    "02": 1800,
    "20": 1200,
    "30": 2000,
  };
  if (table[prefix]) return table[prefix];
  if (subtotalCents >= 20000) return 0;
  return 2500;
}

void computeShippingForCepStub;

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

export async function applyCoupon(
  userId: string,
  code: string,
): Promise<CouponResult> {
  const rows = await repo.listForUser(userId);
  const subtotalCents = rows.reduce(
    (sum, row) => sum + row.item.qty * row.product.priceCents,
    0,
  );
  const result = await couponsService.validateCoupon(code, subtotalCents);
  if (!result.ok) return { ok: false, error: result.error };
  await stateRepo.upsertCoupon(userId, result.coupon.id);
  return { ok: true };
}

export async function removeCoupon(userId: string): Promise<void> {
  await stateRepo.upsertCoupon(userId, null);
}

export async function setShippingAddress(
  userId: string,
  input: AddressInput,
): Promise<void> {
  const address = await stateRepo.createAddress({ userId, ...input });
  await stateRepo.upsertShippingAddress(userId, address.id);
}
