import type { Product as ProductDTO } from "../../types/dto.js";
import type { Product } from "../../db/schema.js";
import * as repo from "./products.repo.js";

const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const listCache: CacheEntry<ProductDTO[]> = { value: [], expiresAt: 0 };
const byIdCache = new Map<string, CacheEntry<ProductDTO>>();

function toDTO(product: Product): ProductDTO {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    color: product.color,
    stockQty: product.stockQty,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
  };
}

function isFresh(entry: CacheEntry<unknown>): boolean {
  return entry.expiresAt > Date.now();
}

export function clearCache(): void {
  listCache.expiresAt = 0;
  listCache.value = [];
  byIdCache.clear();
}

export async function listProducts(): Promise<ProductDTO[]> {
  if (isFresh(listCache)) return listCache.value;
  const products = await repo.listActive();
  const dto = products.map(toDTO);
  listCache.value = dto;
  listCache.expiresAt = Date.now() + CACHE_TTL_MS;
  return dto;
}

export async function getProduct(id: string): Promise<ProductDTO | null> {
  const cached = byIdCache.get(id);
  if (cached && isFresh(cached)) return cached.value;
  const product = await repo.findActiveById(id);
  if (!product) return null;
  const dto = toDTO(product);
  byIdCache.set(id, { value: dto, expiresAt: Date.now() + CACHE_TTL_MS });
  return dto;
}
