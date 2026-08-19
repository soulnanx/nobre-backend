import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import { authGuard } from "../../middleware/auth-guard.js";
import * as service from "./cart.service.js";

const productIdSchema = z.string().uuid();

const addSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().positive().default(1),
});

const patchSchema = z.object({
  qty: z.number().int().min(1),
});

const couponSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

const addressSchema = z.object({
  cep: z.string().regex(/^[0-9]{5}-?[0-9]{3}$/),
  street: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
  complement: z.string().trim().max(200).nullable().optional(),
});

export const cartRoutes = new Hono<AppEnv>();

cartRoutes.use("*", authGuard);

cartRoutes.get("/", async (c) => {
  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.post("/coupon", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = couponSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation" }, 400);

  const result = await service.applyCoupon(c.get("userId"), parsed.data.code);
  if (!result.ok) return c.json({ error: result.error }, 400);

  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.delete("/coupon", async (c) => {
  await service.removeCoupon(c.get("userId"));
  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.put("/shipping-address", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation" }, 400);

  await service.setShippingAddress(c.get("userId"), {
    cep: parsed.data.cep,
    street: parsed.data.street,
    number: parsed.data.number,
    city: parsed.data.city,
    state: parsed.data.state.toUpperCase(),
    complement: parsed.data.complement ?? null,
  });
  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid" }, 400);

  const result = await service.addItem(
    c.get("userId"),
    parsed.data.productId,
    parsed.data.qty,
  );
  if (!result.ok) {
    const status = result.error === "not-found" ? 404 : 400;
    return c.json({ error: result.error }, status);
  }

  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.patch("/:productId", async (c) => {
  const id = productIdSchema.safeParse(c.req.param("productId"));
  if (!id.success) return c.json({ error: "not-found" }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid" }, 400);

  const result = await service.updateItemQty(
    c.get("userId"),
    id.data,
    parsed.data.qty,
  );
  if (!result.ok) {
    const status = result.error === "not-found" ? 404 : 400;
    return c.json({ error: result.error }, status);
  }

  const cart = await service.getCart(c.get("userId"));
  return c.json({ cart }, 200);
});

cartRoutes.delete("/:productId", async (c) => {
  const id = productIdSchema.safeParse(c.req.param("productId"));
  if (!id.success) return c.json({ error: "not-found" }, 404);

  await service.removeItem(c.get("userId"), id.data);
  return c.body(null, 204);
});

cartRoutes.delete("/", async (c) => {
  await service.clearCart(c.get("userId"));
  return c.body(null, 204);
});
