import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { adminGuard } from "../../middleware/admin-guard.js";
import * as service from "./products.service.js";

const idSchema = z.string().uuid();

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  priceCents: z.number().int().positive(),
  color: z.string().trim().min(1).max(100),
  stockQty: z.number().int().min(0),
});

export const productsRoutes = new Hono<AppEnv>();

productsRoutes.get("/", async (c) => {
  const products = await service.listProducts();
  return c.json({ products }, 200);
});

productsRoutes.get("/:id", async (c) => {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.json({ error: "not-found" }, 404);

  const product = await service.getProduct(parsed.data);
  if (!product) return c.json({ error: "not-found" }, 404);

  return c.json({ product }, 200);
});

productsRoutes.post("/", authGuard, adminGuard, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation" }, 400);

  const product = await service.createProduct(parsed.data);
  return c.json({ product }, 201);
});
