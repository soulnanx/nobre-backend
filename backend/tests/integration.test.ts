import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, resetDb, seedProducts, uniqueIp } from "./helpers.js";

describe("API integration", () => {
  const app = buildApp();

  beforeAll(async () => {
    await resetDb();
    await seedProducts();
  });

  afterEach(async () => {
    await resetDb();
    await seedProducts();
  });

  async function register(username: string, password = "segredo123") {
    const res = await app.request("/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": uniqueIp(),
      },
      body: JSON.stringify({ username, password }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    const setCookieValue = (cookie.match(/session=([^;]+)/) ?? [])[1];
    return { res, cookie: setCookieValue ? `session=${setCookieValue}` : "" };
  }

  async function login(username: string, password = "segredo123") {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": uniqueIp(),
      },
      body: JSON.stringify({ username, password }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    const setCookieValue = (cookie.match(/session=([^;]+)/) ?? [])[1];
    return { res, cookie: setCookieValue ? `session=${setCookieValue}` : "" };
  }

  describe("auth", () => {
    it("register → me → logout", async () => {
      const { res, cookie } = await register("alice");
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.user.username).toBe("alice");
      expect(cookie).toContain("session=");

      const me = await app.request("/auth/me", {
        headers: { cookie },
      });
      expect(me.status).toBe(200);
      const meBody = await me.json();
      expect(meBody.user.username).toBe("alice");

      const logout = await app.request("/auth/logout", {
        method: "POST",
        headers: { cookie },
      });
      expect(logout.status).toBe(204);

      const meAfter = await app.request("/auth/me", {
        headers: { cookie },
      });
      expect(meAfter.status).toBe(401);
    });

    it("rejects invalid login", async () => {
      await register("bob");
      const { res } = await login("bob", "senha-errada");
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "invalid" });
    });

    it("rejects duplicate register", async () => {
      await register("carol");
      const { res } = await register("carol");
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({ error: "exists" });
    });

    it("me without session returns 401", async () => {
      const res = await app.request("/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("products", () => {
    it("lists only active products", async () => {
      const res = await app.request("/products");
      expect(res.status).toBe(200);
      const { products } = await res.json();
      expect(products).toHaveLength(2);
      expect(products.some((p: { name: string }) => p.name === "Produto Inativo")).toBe(false);
    });

    it("returns 404 for inactive or missing product", async () => {
      const res = await app.request("/products/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "not-found" });
    });
  });

  describe("cart", () => {
    it("adds, increments, patches, and clears", async () => {
      const { cookie } = await register("dave");
      const { products } = await (await app.request("/products")).json();
      const productId = products[0].id;

      const add = await app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId, qty: 2 }),
      });
      expect(add.status).toBe(200);
      expect((await add.json()).cart.items[0].qty).toBe(2);

      const increment = await app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId, qty: 3 }),
      });
      expect((await increment.json()).cart.items[0].qty).toBe(5);

      const patch = await app.request(`/cart/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ qty: 1 }),
      });
      expect((await patch.json()).cart.items[0].qty).toBe(1);

      const clear = await app.request("/cart", {
        method: "DELETE",
        headers: { cookie },
      });
      expect(clear.status).toBe(204);
      const empty = await app.request("/cart", { headers: { cookie } });
      expect((await empty.json()).cart.items).toHaveLength(0);
    });

    it("rejects qty above stock", async () => {
      const { cookie } = await register("erin");
      const { products } = await (await app.request("/products")).json();
      const productId = products[0].id;

      const res = await app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId, qty: 999 }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "stock" });
    });

    it("requires auth", async () => {
      const res = await app.request("/cart");
      expect(res.status).toBe(401);
    });
  });

  describe("orders", () => {
    it("creates order, decrements stock, clears cart, lists", async () => {
      const { cookie } = await register("frank");
      const { products } = await (await app.request("/products")).json();
      const productId = products[0].id;

      await app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId, qty: 2 }),
      });

      const create = await app.request("/orders", {
        method: "POST",
        headers: { cookie },
      });
      expect(create.status).toBe(201);
      const created = await create.json();
      expect(created.order.totalCents).toBe(2 * 7990);
      expect(created.order.items).toHaveLength(1);
      expect(created.order.items[0].name).toBe("Camiseta Básica");

      const productAfter = await (await app.request(`/products/${productId}`)).json();
      expect(productAfter.product.stockQty).toBe(18);

      const cartAfter = await app.request("/cart", { headers: { cookie } });
      expect((await cartAfter.json()).cart.items).toHaveLength(0);

      const list = await app.request("/orders", { headers: { cookie } });
      const listBody = await list.json();
      expect(listBody.orders).toHaveLength(1);
      expect(listBody.orders[0].id).toBe(created.order.id);
    });

    it("rejects empty cart", async () => {
      const { cookie } = await register("gina");
      const res = await app.request("/orders", {
        method: "POST",
        headers: { cookie },
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "empty-cart" });
    });

    it("rolls back on insufficient stock", async () => {
      const { cookie } = await register("henry");
      const { products } = await (await app.request("/products")).json();
      const lowStockProduct = products.find((p: { name: string }) => p.name === "Tênis Urban")!;

      const add = await app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId: lowStockProduct.id, qty: 2 }),
      });
      expect(add.status).toBe(200);

      const { db } = await import("../src/db/client.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`UPDATE products SET stock_qty = 1 WHERE id = ${lowStockProduct.id}`);

      const res = await app.request("/orders", {
        method: "POST",
        headers: { cookie },
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "stock" });

      const after = await (await app.request(`/products/${lowStockProduct.id}`)).json();
      expect(after.product.stockQty).toBe(1);

      const cartAfter = await app.request("/cart", { headers: { cookie } });
      expect((await cartAfter.json()).cart.items).toHaveLength(1);
    });
  });
});
