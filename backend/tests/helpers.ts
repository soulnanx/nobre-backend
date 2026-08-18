import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import type { AppEnv } from "../src/types/app.js";
import { requestId } from "../src/middleware/request-id.js";
import { logger } from "../src/middleware/logger.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { authRoutes } from "../src/modules/auth/auth.route.js";
import { productsRoutes } from "../src/modules/products/products.route.js";
import { cartRoutes } from "../src/modules/cart/cart.route.js";
import { ordersRoutes } from "../src/modules/orders/orders.route.js";
import { corsOrigins } from "../src/config/index.js";

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requestId);
  app.use("*", errorHandler);
  app.use("*", logger);
  app.use("*", compress());
  app.use("*", cors({ origin: corsOrigins }));
  app.route("/auth", authRoutes);
  app.route("/products", productsRoutes);
  app.route("/cart", cartRoutes);
  app.route("/orders", ordersRoutes);
  return app;
}

let ipCounter = 0;

export function uniqueIp(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter % 254}`;
}

export async function resetDb() {
  const { db } = await import("../src/db/client.js");
  const { clearCache } = await import("../src/modules/products/products.service.js");
  clearCache();
  await db.execute(
    "TRUNCATE TABLE order_items, orders, cart_items, sessions, products, users RESTART IDENTITY CASCADE",
  );
}

export async function seedProducts() {
  const { db } = await import("../src/db/client.js");
  const { products } = await import("../src/db/schema.js");
  await db.insert(products).values([
    {
      name: "Camiseta Básica",
      description: "Camiseta de algodão.",
      priceCents: 7990,
      color: "from-sky-500/30 to-blue-600/30",
      stockQty: 20,
      active: true,
    },
    {
      name: "Tênis Urban",
      description: "Tênis urbano.",
      priceCents: 24990,
      color: "from-violet-500/30 to-purple-600/30",
      stockQty: 2,
      active: true,
    },
    {
      name: "Produto Inativo",
      description: "Não deve aparecer no catálogo.",
      priceCents: 9990,
      color: "from-zinc-500/30 to-zinc-600/30",
      stockQty: 5,
      active: false,
    },
  ]);
}
