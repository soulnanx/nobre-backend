import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import * as service from "./products.service.js";

const idSchema = z.string().uuid();

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
