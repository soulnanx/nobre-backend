# Plano — Carrinho de compras (melhorias)

## Metadados

| Campo | Valor |
| --- | --- |
| Referência | [`spec.md`](./spec.md) |
| Status | `aprovada` |
| Versão | 0.1.0 |
| Data | 2026-08-19 |

## Decisões técnicas

| # | Decisão | Justificativa |
| --- | --- | --- |
| AD-01 | Tabela `coupons` (DD-01): `id` (uuid), `code` (text unique), `discount_type` (`percent`/`fixed` text), `discount_value` (integer), `min_subtotal_cents` (integer nullable), `expires_at` (timestamptz nullable), `active` (boolean default true), `created_at`. | RF-01; types simples em texto para espelhar o DTO. |
| AD-02 | Tabela `addresses` (DD-02): `id`, `user_id` FK (cascade), `cep`, `street`, `number`, `city`, `state` (2 chars), `complement` (nullable), `created_at`. | RF-02; 1:N para o usuário. |
| AD-03 | `cart_items` ganha `added_at timestamptz NOT NULL DEFAULT NOW()` (RF-03). | Suporta TTL lazy. |
| AD-04 | `cart_items` ganha `coupon_id` (FK coupons, nullable) **e** `shipping_address_id` (FK addresses, nullable) **OU** duas colunas novas — decidido: **uma `cart_user_state`** (1:1 com user) para evitar acoplamento `cart_items` × cupom. Ver AD-04b. | |
| AD-04b | Nova tabela `cart_user_state` (`user_id` PK FK, `coupon_id` FK nullable, `shipping_address_id` FK nullable, `updated_at`). Não conflita com `cart_items` (já existente). | Cupom e endereço são do **usuário**, não da linha do cart. |
| AD-05 | `GET /shipping/quote` implementa um stub: tabela `shipping_rules` (`id`, `cep_prefix` text, `price_cents` integer). Match por prefixo (ex.: `cep_prefix = "01"` cobre `01000-000` a `01999-999`). Sem match → `shippingCents = 0`. | RF-08; stub simples, sem integrador. |
| AD-06 | Cleanup lazy em `GET /cart` (DELETE cart_items WHERE added_at < NOW() - INTERVAL '7 days') + script `db:clean-carts`. | DD-05; sem Redis/cron. |
| AD-07 | TTL configurável via `env.CART_TTL_DAYS` (default 7). | DD-06. |
| AD-08 | `Cart` DTO ganha `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`, `coupon: PublicCoupon \| null`, `shippingAddress: PublicAddress \| null`. | RF-09; DD-07. |
| AD-09 | Cálculo de desconto: `percent` → `Math.floor(subtotal * value / 100)`; `fixed` → `min(value, subtotal)`. | Casos de borda da spec. |
| AD-10 | Validação zod de endereço: `cep` regex `^[0-9]{5}-?[0-9]{3}$`, `state` 2 chars uppercase, `street`/`city`/`number` 1–200. | RF-11. |
| AD-11 | DTOs `PublicCoupon` e `PublicAddress` adicionados em `shared/dto.ts`. | Constitution §2; fonte da verdade do contrato. |
| AD-12 | Sem dependências novas. | Constitution §4. |
| AD-13 | Migração aditiva via `drizzle-kit generate`. | Constitution §3. |

## Contratos de dados / API

### Schema (migrações)

| Tabela | Mudança |
| --- | --- |
| `coupons` | NOVA. |
| `addresses` | NOVA. |
| `cart_items` | `+ added_at timestamptz NOT NULL DEFAULT NOW()`. |
| `cart_user_state` | NOVA (1:1 com user). |
| `shipping_rules` | NOVA (stub de frete). |

### DTO (`shared/dto.ts`)

```ts
export type PublicCoupon = {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  expiresAt: string | null;
};

export type PublicAddress = {
  id: string;
  cep: string;
  street: string;
  number: string;
  city: string;
  state: string;
  complement: string | null;
};

export type Cart = {
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  coupon: PublicCoupon | null;
  shippingAddress: PublicAddress | null;
};
```

### Endpoints

| Método | Caminho | Auth | Entrada | Saída | Erros |
| --- | --- | --- | --- | --- | --- |
| POST | `/cart/coupon` | cookie | `{ code }` | `200 { cart }` | `400 {error:"invalid-coupon"}` · `400 {error:"validation"}` |
| DELETE | `/cart/coupon` | cookie | – | `200 { cart }` | – |
| PUT | `/cart/shipping-address` | cookie | `{ address }` | `200 { cart }` | `400 {error:"validation"}` |
| GET | `/shipping/quote` | cookie | `?cep=...&subtotalCents=...` | `200 { shippingCents }` | `400 {error:"validation"}` |
| GET | `/cart` | cookie | – | `200 { cart }` (atualizado com totais) | – |

### Validação

- `applyCouponSchema`: `code: z.string().trim().min(1).max(64)`.
- `shippingAddressSchema`: `cep` (regex), `street` (1–200), `number` (1–20),
  `city` (1–100), `state` (2 chars uppercase), `complement` (≤200, nullable).
- `shippingQuoteSchema`: `cep` (regex), `subtotalCents` (int ≥ 0).

## Módulos / arquivos afetados

| Arquivo | Mudança |
| --- | --- |
| `shared/dto.ts` | `PublicCoupon`, `PublicAddress`, `Cart` atualizado. |
| `backend/src/db/schema.ts` | Tabelas `coupons`, `addresses`, `cart_user_state`, `shipping_rules`; `cart_items.added_at`. |
| `backend/src/db/migrations/` | Nova migração (`drizzle-kit generate`). |
| `backend/src/modules/cart/cart.service.ts` | `applyCoupon`, `removeCoupon`, `setShippingAddress`, totais (`subtotal/discount/shipping/total`), `cleanupExpiredItems`. |
| `backend/src/modules/cart/cart.repo.ts` | Operações de `cart_user_state`, `cleanupExpiredItems`. |
| `backend/src/modules/cart/cart.route.ts` | `POST/DELETE /cart/coupon`, `PUT /cart/shipping-address`. |
| `backend/src/modules/coupons/coupons.route.ts` (novo) | `GET /shipping/quote` (ou `backend/src/modules/shipping/`). |
| `backend/src/modules/shipping/shipping.repo.ts` (novo) | `findRuleByCepPrefix`. |
| `backend/src/db/clean-carts.ts` (novo) | Script `db:clean-carts`. |
| `backend/src/db/seed-coupons.ts` (novo) | Script `db:seed-coupons` (opcional). |
| `backend/src/config/index.ts` | `CART_TTL_DAYS` (default 7). |
| `backend/package.json` | Scripts `db:clean-carts`, `db:seed-coupons`. |
| `backend/tests/integration.test.ts` | Cenários: cupom (válido/inválido/expirado), endereço, frete, totais, expiração. |

## Fluxos

**Aplicar cupom:** `POST /cart/coupon` → valida `code` (zod) → busca cupom
(`active=true`, `expires_at > NOW()` ou `NULL`, `subtotal >= min_subtotal_cents`)
→ calcula `discountCents` → upsert `cart_user_state.coupon_id` → retorna
`GET /cart` com totais recalculados.

**Remover cupom:** `DELETE /cart/coupon` → set `cart_user_state.coupon_id = NULL`
→ retorna `GET /cart`.

**Definir endereço:** `PUT /cart/shipping-address` → valida (zod) → cria/atualiza
`addresses` (1:N user) → set `cart_user_state.shipping_address_id` → retorna
`GET /cart`.

**Calcular frete:** `GET /shipping/quote?cep=...&subtotalCents=...` → valida
→ busca `shipping_rules` por `cep_prefix` (maior match) → retorna
`{ shippingCents }`.

**Expiração:** A cada `GET /cart`, `DELETE FROM cart_items WHERE added_at < NOW()
- INTERVAL '7 days'`. Script `db:clean-carts` faz o mesmo em loop único.

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Migração em banco com cart_items | `added_at NOT NULL DEFAULT NOW()` (ALTER TABLE aditivo). |
| Frete stub enganar o usuário | Documentado como stub; retorna `0` se sem regra. |
| Cleanup lazy em alta concorrência | DELETE idempotente; sem lock. |
| Cupom `percent` com arredondamento | `Math.floor` (conservador — a favor da loja). |
| Frontend não atualizar | `cart` DTO mantém `totalCents` (existente); novos campos são aditivos. |

## Fora de escopo

- Integração real com transportadora (frete real).
- CRUD completo de endereços (lista, edita, remove — spec futura).
- Cupom por usuário, limite de uso, cupom de primeira compra.
- Carrinho de visitante (anônimo).
- Multi-cupom ou cupom + cashback.
- Estorno / alteração pós-pedido (cobre `tela-checkout`).
