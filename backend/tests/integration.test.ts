import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, resetDb, seedCoupons, seedProducts, uniqueIp } from "./helpers.js";

describe("API integration", () => {
  const app = buildApp();

  beforeAll(async () => {
    await resetDb();
    await seedProducts();
    await seedCoupons();
  });

  afterEach(async () => {
    await resetDb();
    await seedProducts();
    await seedCoupons();
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

    it("includes role in public user", async () => {
      const { res, cookie } = await register("role-check");
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.user.role).toBe("customer");

      const me = await app.request("/auth/me", { headers: { cookie } });
      const meBody = await me.json();
      expect(meBody.user.role).toBe("customer");
    });
  });

  describe("admin POST /products", () => {
    async function promoteToAdmin(username: string): Promise<void> {
      const { db } = await import("../src/db/client.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(
        sql`UPDATE users SET role = 'admin' WHERE username = ${username}`,
      );
    }

    const validPayload = {
      name: "Camiseta Polo",
      description: "Camiseta polo de algodão piqué.",
      priceCents: 9990,
      color: "from-emerald-500/30 to-teal-600/30",
      stockQty: 5,
    };

    it("admin creates product and invalidates catalog cache", async () => {
      const { cookie } = await register("admin1");
      await promoteToAdmin("admin1");

      const before = await app.request("/products");
      const beforeBody = await before.json();
      expect(beforeBody.products).toHaveLength(2);

      const create = await app.request("/products", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(validPayload),
      });
      expect(create.status).toBe(201);
      const created = await create.json();
      expect(created.product.name).toBe(validPayload.name);
      expect(created.product.active).toBe(true);
      expect(created.product.priceCents).toBe(validPayload.priceCents);

      const after = await app.request("/products");
      const afterBody = await after.json();
      expect(afterBody.products).toHaveLength(3);
      expect(
        afterBody.products.some((p: { id: string }) => p.id === created.product.id),
      ).toBe(true);
    });

    it("non-admin returns 403 forbidden", async () => {
      const { cookie } = await register("customer1");

      const res = await app.request("/products", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(validPayload),
      });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "forbidden" });

      const list = await app.request("/products");
      const listBody = await list.json();
      expect(listBody.products).toHaveLength(2);
    });

    it("anonymous returns 401 unauthorized", async () => {
      const res = await app.request("/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload),
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    });

    it("admin with invalid body returns 400 validation", async () => {
      const { cookie } = await register("admin2");
      await promoteToAdmin("admin2");

      const res = await app.request("/products", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ ...validPayload, priceCents: -100 }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "validation" });
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

  describe("cart extras", () => {
    async function addItem(cookie: string, productId: string, qty = 1) {
      return app.request("/cart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ productId, qty }),
      });
    }

    it("cart returns subtotalCents, discountCents, shippingCents, totalCents", async () => {
      const { cookie } = await register("totals-user");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      const res = await app.request("/cart", { headers: { cookie } });
      const body = await res.json();
      expect(body.cart.subtotalCents).toBe(7990);
      expect(body.cart.discountCents).toBe(0);
      expect(body.cart.shippingCents).toBe(0);
      expect(body.cart.totalCents).toBe(7990);
      expect(body.cart.coupon).toBeNull();
      expect(body.cart.shippingAddress).toBeNull();
    });

    it("applies valid coupon and reflects discount", async () => {
      const { cookie } = await register("coupon-user");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 2);

      const apply = await app.request("/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ code: "BEMVINDO10" }),
      });
      expect(apply.status).toBe(200);
      const body = await apply.json();
      expect(body.cart.subtotalCents).toBe(7990 * 2);
      expect(body.cart.discountCents).toBe(Math.floor((7990 * 2 * 10) / 100));
      expect(body.cart.coupon?.code).toBe("BEMVINDO10");
    });

    it("rejects unknown coupon with invalid-coupon", async () => {
      const { cookie } = await register("coupon-bad");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      const res = await app.request("/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ code: "NAOEXISTE" }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalid-coupon" });
    });

    it("rejects expired coupon with invalid-coupon", async () => {
      const { cookie } = await register("coupon-exp");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      const res = await app.request("/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ code: "EXPIRADO" }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalid-coupon" });
    });

    it("removes applied coupon", async () => {
      const { cookie } = await register("coupon-rm");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      await app.request("/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ code: "BEMVINDO10" }),
      });

      const remove = await app.request("/cart/coupon", {
        method: "DELETE",
        headers: { cookie },
      });
      expect(remove.status).toBe(200);
      const body = await remove.json();
      expect(body.cart.discountCents).toBe(0);
      expect(body.cart.coupon).toBeNull();
    });

    it("sets shipping address and computes shipping", async () => {
      const { cookie } = await register("addr-user");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      const res = await app.request("/cart/shipping-address", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          cep: "01310-100",
          street: "Av. Paulista",
          number: "1000",
          city: "São Paulo",
          state: "SP",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cart.shippingAddress?.cep).toBe("01310-100");
      expect(body.cart.shippingCents).toBe(1500);
    });

    it("rejects invalid CEP with validation", async () => {
      const { cookie } = await register("addr-bad");
      const res = await app.request("/cart/shipping-address", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          cep: "abc",
          street: "x",
          number: "1",
          city: "x",
          state: "SP",
        }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "validation" });
    });

    it("quotes shipping by CEP and subtotal", async () => {
      const { cookie } = await register("ship-quote");
      const res = await app.request(
        "/shipping/quote?cep=01310-100&subtotalCents=7990",
        { headers: { cookie } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shippingCents).toBe(1500);
    });

    it("cleanup removes items older than TTL", async () => {
      const { cookie } = await register("cleanup-user");
      const { products } = await (await app.request("/products")).json();
      await addItem(cookie, products[0].id, 1);

      const { db } = await import("../src/db/client.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(
        sql`UPDATE cart_items SET added_at = NOW() - INTERVAL '10 days'`,
      );

      const cart = await app.request("/cart", { headers: { cookie } });
      const body = await cart.json();
      expect(body.cart.items).toHaveLength(0);
      expect(body.cart.subtotalCents).toBe(0);
    });
  });
});
