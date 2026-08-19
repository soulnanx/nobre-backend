# Tasks — Carrinho de compras (melhorias)

## Metadados

| Campo | Valor |
| --- | --- |
| Referência | [`spec.md`](./spec.md) · [`plan.md`](./plan.md) |
| Status | `aprovada` |
| Versão | 0.1.0 |
| Data | 2026-08-19 |

## Convenções

- Cada task é atômica (1–4h) e referencia o requisito que atende (`RF-0x`).
- Validação final obrigatória: `make lint` + `make build` + `make test`
  (Postgres de pé via `make infra-up`).
- Commits: `git add` apenas dos arquivos da feature; mensagem em português
  referenciando o `RF-0x`.

## Tasks

### T-01 — DTOs `PublicCoupon` e `PublicAddress`

- **RF:** RF-09 (DD-07, AD-11)
- **Dependências:** nenhuma
- **Ações:**
  1. Em `shared/dto.ts`, adicionar `PublicCoupon` e `PublicAddress`.
  2. Em `backend/src/types/dto.ts`, re-exportar.
- **DoD:** tipos exportados e consumíveis.

### T-02 — Schema: `coupons`, `addresses`, `cart_items.added_at`, `cart_user_state`, `shipping_rules`

- **RF:** RF-01, RF-02, RF-03, AD-04b, AD-05
- **Dependências:** nenhuma
- **Ações:**
  1. Em `backend/src/db/schema.ts`, adicionar:
     - `coupons` (AD-01).
     - `addresses` (AD-02).
     - `cart_user_state` (AD-04b).
     - `shipping_rules` (AD-05).
     - `cart_items.added_at timestamptz NOT NULL DEFAULT NOW()` (AD-03).
  2. `npm run db:generate`; conferir que a migração é aditiva.
  3. `make migrate`.
- **DoD:** migração SQL versionada; colunas/tabelas presentes.

### T-03 — Env: `CART_TTL_DAYS`

- **RF:** RF-13, DD-06
- **Dependências:** nenhuma
- **Ações:**
  1. Em `backend/src/config/`, adicionar `CART_TTL_DAYS` (zod, default 7).
  2. Atualizar `.env.example` (se existir).
- **DoD:** env carregada no boot.

### T-04 — Repos: `cart_user_state`, `cleanupExpiredItems`, `shipping_rules`

- **RF:** RF-13, AD-04b, AD-05
- **Dependências:** T-02
- **Ações:**
  1. Em `backend/src/modules/cart/cart.repo.ts`, adicionar:
     - `getCartUserState(userId)`.
     - `upsertCoupon(userId, couponId | null)`.
     - `upsertShippingAddress(userId, addressId | null)`.
     - `cleanupExpiredItems(ttlDays)`.
- **DoD:** funções tipadas e testáveis.

### T-05 — Coupons: repo + validações de cupom

- **RF:** RF-01, RF-10
- **Dependências:** T-02
- **Ações:**
  1. Criar `backend/src/modules/coupons/coupons.repo.ts`:
     - `findByCode(code)`.
  2. Criar `backend/src/modules/coupons/coupons.service.ts`:
     - `validateCoupon(code, subtotalCents)` retorna
       `{ ok: true, coupon, discountCents } | { ok: false, error: "invalid-coupon" }`.
- **DoD:** validação coberta (expirado, inativo, abaixo do mínimo).

### T-06 — Cart service: aplicar/remover cupom, definir endereço, totais

- **RF:** RF-05, RF-06, RF-07, RF-09, RF-12
- **Dependências:** T-01, T-04, T-05
- **Ações:**
  1. Em `backend/src/modules/cart/cart.service.ts`:
     - `applyCoupon(userId, code)` → busca cupom (service), valida,
       upsert `cart_user_state.coupon_id`, recalcula totals.
     - `removeCoupon(userId)` → set NULL, recalcula.
     - `setShippingAddress(userId, address)` → upsert `addresses`,
       upsert `cart_user_state.shipping_address_id`, recalcula.
     - Helper `computeTotals(items, coupon, shippingAddress)` →
       `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`.
     - `getCart(userId)` agora retorna o DTO com totais + coupon + address.
     - `getCart` chama `cleanupExpiredItems` antes de listar (lazy).
- **DoD:** DTO `Cart` populado com todos os campos.

### T-07 — Shipping: stub + endpoint

- **RF:** RF-08
- **Dependências:** T-02, T-06
- **Ações:**
  1. Criar `backend/src/modules/shipping/shipping.repo.ts`:
     - `findRuleByCep(cep)` (busca `cep_prefix` mais específico).
  2. Criar `backend/src/modules/shipping/shipping.service.ts`:
     - `quote(cep, subtotalCents)` → `{ shippingCents }`.
  3. Criar `backend/src/modules/shipping/shipping.route.ts`:
     - `GET /shipping/quote` (authGuard, zod query).
- **DoD:** endpoint retorna `shippingCents` baseado em `shipping_rules`.

### T-08 — Routes: cupom e endereço

- **RF:** RF-05, RF-06, RF-07, RF-11
- **Dependências:** T-06
- **Ações:**
  1. Em `backend/src/modules/cart/cart.route.ts`:
     - `POST /cart/coupon` (authGuard, zod) → `applyCoupon`.
     - `DELETE /cart/coupon` (authGuard) → `removeCoupon`.
     - `PUT /cart/shipping-address` (authGuard, zod) → `setShippingAddress`.
- **DoD:** rotas registradas; erros corretos (`invalid-coupon`, `validation`).

### T-09 — Scripts: `db:clean-carts` e `db:seed-coupons`

- **RF:** RF-13, RF-14
- **Dependências:** T-02
- **Ações:**
  1. Criar `backend/src/db/clean-carts.ts` (usa `CART_TTL_DAYS`).
  2. Criar `backend/src/db/seed-coupons.ts` (2 cupons de exemplo).
  3. Adicionar scripts npm no `backend/package.json`.
- **DoD:** `npm run db:clean-carts` remove itens > TTL; seed idempotente.

### T-10 — Testes de integração

- **RF:** RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RF-13
- **Dependências:** T-07, T-08, T-09
- **Ações:** em `backend/tests/integration.test.ts`, adicionar `describe("cart extras")`:
  1. Aplicar cupom válido → `discountCents` reflete; `coupon.code` presente.
  2. Cupom inexistente → `400 { error: "invalid-coupon" }`.
  3. Cupom expirado → `400 { error: "invalid-coupon" }`.
  4. `DELETE /cart/coupon` → `discountCents = 0`.
  5. `PUT /cart/shipping-address` válido → `shippingAddress` presente.
  6. `PUT /cart/shipping-address` com CEP inválido → `400 { error: "validation" }`.
  7. `GET /shipping/quote?cep=...&subtotalCents=...` → `{ shippingCents }`.
  8. `GET /cart` retorna `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`.
  9. `db:clean-carts` remove itens > TTL (testar com `CART_TTL_DAYS=0`).
- **DoD:** suíte completa verde.

### T-11 — Validação final + evidência

- **RF:** todos
- **Dependências:** T-10
- **Ações:**
  1. `make lint` (0 erros).
  2. `make build` (tsc ok).
  3. `make test` (Postgres de pé).
  4. Evidência curl:
     - `POST /cart/coupon` com cupom válido → `200 { cart }` com desconto.
     - `POST /cart/coupon` com cupom inexistente → `400 invalid-coupon`.
     - `PUT /cart/shipping-address` → `200 { cart }` com endereço.
     - `GET /shipping/quote?cep=01310-100&subtotalCents=7990` → `{ shippingCents }`.
     - `GET /cart` → totais preenchidos.
- **DoD:** lint/build/test verdes; evidência registrada.

## Evidência (preencher na T-11)

```text
=== Ambiente ===
- Postgres: porta 5433, schema migrado (0002_yielding_kid_colt.sql).
- API: http://localhost:3001 (make dev).
- Cupons seed: BEMVINDO10 (10% off), FRETE0 (R$15 off, mín R$200), EXPIRADO (50% off, expirado).
- Shipping rules seed: prefixo "01" → 1500, prefixo "02" → 1800.

=== 1. register (cliente) ===
$ curl -s -c /tmp/cart-cookie.txt -X POST http://localhost:3001/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"clara","password":"segredo123"}'
{"user":{"id":"d3f7d393-17b2-4fe0-a1ac-6884a8d6c01d","username":"clara","role":"customer","createdAt":"2026-08-19T20:17:00.269Z"}}

=== 2. POST /cart (qty=2, Moletom R$189.90) ===
$ curl -s -b /tmp/cart-cookie.txt -X POST http://localhost:3001/cart \
    -H "Content-Type: application/json" \
    -d '{"productId":"4fe23b09-b0cc-4762-93b4-59153c00ed98","qty":2}'
{"cart":{"items":[...],"subtotalCents":37980,"discountCents":0,"shippingCents":0,"totalCents":37980,"coupon":null,"shippingAddress":null}}

=== 3. GET /cart (sem cupom, sem endereço) ===
$ curl -s -b /tmp/cart-cookie.txt http://localhost:3001/cart
subtotalCents=37980, discountCents=0, shippingCents=0, totalCents=37980
coupon=null, shippingAddress=null

=== 4. POST /cart/coupon (BEMVINDO10, 10% off) → 200 ===
$ curl -s -b /tmp/cart-cookie.txt -X POST http://localhost:3001/cart/coupon \
    -H "Content-Type: application/json" \
    -d '{"code":"BEMVINDO10"}'
{"cart":{...,"subtotalCents":37980,"discountCents":3798,"shippingCents":0,"totalCents":34182,"coupon":{"code":"BEMVINDO10","discountType":"percent","discountValue":10,"expiresAt":null},"shippingAddress":null}}

=== 5. PUT /cart/shipping-address (CEP 01310-100) → 200 ===
$ curl -s -b /tmp/cart-cookie.txt -X PUT http://localhost:3001/cart/shipping-address \
    -H "Content-Type: application/json" \
    -d '{"cep":"01310-100","street":"Av. Paulista","number":"1000","city":"São Paulo","state":"SP"}'
{"cart":{...,"subtotalCents":37980,"discountCents":3798,"shippingCents":1500,"totalCents":35682,"coupon":{"code":"BEMVINDO10",...},"shippingAddress":{"id":"3dad1a8f-...","cep":"01310-100",...}}}

=== 6. GET /shipping/quote?cep=01310-100&subtotalCents=15980 → 1500 ===
$ curl -s -b /tmp/cart-cookie.txt "http://localhost:3001/shipping/quote?cep=01310-100&subtotalCents=15980"
{"shippingCents":1500}

=== 7. POST /cart/coupon (cupom inexistente) → 400 invalid-coupon ===
$ curl -s -b /tmp/cart-cookie.txt -X POST http://localhost:3001/cart/coupon \
    -H "Content-Type: application/json" \
    -d '{"code":"NAOEXISTE"}'
{"error":"invalid-coupon"}
HTTP 400

=== 8. DELETE /cart/coupon → 200 (discountCents=0, coupon=null) ===
$ curl -s -b /tmp/cart-cookie.txt -X DELETE http://localhost:3001/cart/coupon
{"cart":{...,"discountCents":0,"shippingCents":1500,"totalCents":39480,"coupon":null,"shippingAddress":{...}}}

=== make lint ===
$ make lint
> eslint src --max-warnings 0
(sem erros)

=== make build ===
$ make build
> tsc
(sem erros)

=== make test ===
$ make test
 Test Files  4 passed (4)
      Tests  34 passed (34)
```

## Definition of Done da feature

- [ ] Migrações aplicadas e versionadas.
- [ ] `PublicCoupon` e `PublicAddress` em `shared/dto.ts`.
- [ ] `Cart` DTO com `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`, `coupon`, `shippingAddress`.
- [ ] `POST/DELETE /cart/coupon` com erros corretos.
- [ ] `PUT /cart/shipping-address` com validação.
- [ ] `GET /shipping/quote` retorna `shippingCents`.
- [ ] Cleanup de itens > TTL funciona (lazy + script).
- [ ] `make lint`, `make build`, `make test` verdes.
- [ ] Evidência curl registrada.
- [ ] Pasta movida `specs/to-do/` → `specs/wip/` → `specs/done/` conforme status.
