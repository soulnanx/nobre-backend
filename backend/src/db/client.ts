import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/index.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.POOL_SIZE,
});

export const db = drizzle(pool, { schema });
