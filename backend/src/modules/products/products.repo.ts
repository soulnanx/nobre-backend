import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { products } from "../../db/schema.js";
import type { Product } from "../../db/schema.js";

export async function listActive(): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.createdAt));
}

export async function findActiveById(
  id: string,
): Promise<Product | undefined> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.active, true)))
    .limit(1);
  return product;
}

export async function findById(id: string): Promise<Product | undefined> {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product;
}
