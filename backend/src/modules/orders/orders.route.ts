import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import { authGuard } from "../../middleware/auth-guard.js";
import * as service from "./orders.service.js";

const idSchema = z.string().uuid();

export const ordersRoutes = new Hono<AppEnv>();

ordersRoutes.use("*", authGuard);

ordersRoutes.post("/", async (c) => {
  const result = await service.createOrder(c.get("userId"));
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  return c.json({ order: result.order }, 201);
});

ordersRoutes.get("/", async (c) => {
  const orders = await service.listOrders(c.get("userId"));
  return c.json({ orders }, 200);
});

ordersRoutes.get("/:id", async (c) => {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.json({ error: "not-found" }, 404);

  const order = await service.getOrder(c.get("userId"), parsed.data);
  if (!order) return c.json({ error: "not-found" }, 404);

  return c.json({ order }, 200);
});