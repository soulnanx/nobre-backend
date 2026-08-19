import type { Coupon } from "../../db/schema.js";
import * as repo from "./coupons.repo.js";

export type ValidateCouponResult =
  | { ok: true; coupon: Coupon; discountCents: number }
  | { ok: false; error: "invalid-coupon" };

export function computeDiscount(
  coupon: Coupon,
  subtotalCents: number,
): number {
  if (coupon.discountType === "percent") {
    return Math.floor((subtotalCents * coupon.discountValue) / 100);
  }
  return Math.min(coupon.discountValue, subtotalCents);
}

export async function validateCoupon(
  code: string,
  subtotalCents: number,
): Promise<ValidateCouponResult> {
  const coupon = await repo.findByCode(code);
  if (!coupon) return { ok: false, error: "invalid-coupon" };
  if (!coupon.active) return { ok: false, error: "invalid-coupon" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "invalid-coupon" };
  }
  if (
    coupon.minSubtotalCents !== null &&
    subtotalCents < coupon.minSubtotalCents
  ) {
    return { ok: false, error: "invalid-coupon" };
  }
  return {
    ok: true,
    coupon,
    discountCents: computeDiscount(coupon, subtotalCents),
  };
}
