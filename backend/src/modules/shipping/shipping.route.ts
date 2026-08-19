import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import { authGuard } from "../../middleware/auth-guard.js";
import * as service from "./shipping.service.js";

const querySchema = z.object({
  cep: z.string().regex(/^[0-9]{5}-?[0-9]{3}$/),
  subtotalCents: z.coerce.number().int().min(0),
});

export const shippingRoutes = new Hono<AppEnv>();

shippingRoutes.get("/quote", authGuard, async (c) => {
  const parsed = querySchema.safeParse({
    cep: c.req.query("cep"),
    subtotalCents: c.req.query("subtotalCents"),
  });
  if (!parsed.success) return c.json({ error: "validation" }, 400);

  const shippingCents = await service.quote(
    parsed.data.cep,
    parsed.data.subtotalCents,
  );
  return c.json({ shippingCents }, 200);
});
