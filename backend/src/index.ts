import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { corsOrigins, env } from "./config/index.js";
import type { AppEnv } from "./types/app.js";
import { requestId } from "./middleware/request-id.js";
import { logger } from "./middleware/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./modules/auth/auth.route.js";
import { productsRoutes } from "./modules/products/products.route.js";
import { cartRoutes } from "./modules/cart/cart.route.js";
import { ordersRoutes } from "./modules/orders/orders.route.js";

const app = new Hono<AppEnv>();

app.use("*", requestId);
app.use("*", errorHandler);
app.use("*", logger);
app.use("*", compress());
app.use("*", cors({ origin: corsOrigins }));

app.get("/health", (c) => c.json({ status: "ok" }, 200));

app.route("/auth", authRoutes);
app.route("/products", productsRoutes);
app.route("/cart", cartRoutes);
app.route("/orders", ordersRoutes);

const server = serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: `api listening on port ${info.port}`,
      }),
    );
  },
);

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});