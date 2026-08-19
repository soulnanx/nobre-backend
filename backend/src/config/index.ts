import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  POOL_SIZE: z.coerce.number().int().positive().default(10),
  SESSION_TTL: z.coerce.number().int().positive().default(86400),
  RATE_LIMIT_REGISTER: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(10),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  CART_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "invalid environment",
      issues: parsed.error.flatten().fieldErrors,
    }),
  );
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
