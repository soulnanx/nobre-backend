# Tasks — Tela de checkout (sem pagamento)

## Metadados

| Campo | Valor |
| --- | --- |
| Referência | [`spec.md`](./spec.md) · [`plan.md`](./plan.md) |
| Status | `aprovada` |
| Versão | 0.1.0 |
| Data | 2026-08-19 |
| Dependências | `specs/to-do/carrinho-de-compras/` deve estar `done` |

## Convenções

- Cada task é atômica (1–4h) e referencia o requisito que atende (`RF-0x`).
- Validação final obrigatória: `make lint` + `make build` + `make test`
  (Postgres de pé via `make infra-up`).
- Commits: `git add` apenas dos arquivos da feature; mensagem em português
  referenciando o `RF-0x`.

## Tasks

### T-01 — DTOs: `OrderStatus`, `PaymentStatus`, `OrderStatusEvent`, `Order` (com `paymentStatus`, `paymentUrl`, `statusHistory`), `OrderSummary`

- **RF:** RF-09, RF-12, RF-13
- **Dependências:** nenhuma
- **Ações:**
  1. Em `shared/dto.ts`, adicionar os novos tipos.
  2. Em `backend/src/types/dto.ts`, re-exportar.
- **DoD:** tipos exportados e alinhados com `plan.md`.

### T-02 — Schema: `orders.payment_status`, `orders.payment_url`, `order_status_events`

- **RF:** RF-09, RF-11
- **Dependências:** nenhuma
- **Ações:**
  1. Em `backend/src/db/schema.ts`, adicionar:
     - `orders.payment_status text NOT NULL DEFAULT 'pending'`.
     - `orders.payment_url text NULL`.
     - Tabela `order_status_events` (AD-02).
  2. `npm run db:generate`; conferir migração aditiva.
  3. `make migrate`.
- **DoD:** migração SQL versionada.

### T-03 — Env: `PAYMENT_PLACEHOLDER_BASE_URL`

- **RF:** RF-10, AD-06
- **Dependências:** nenhuma
- **Ações:**
  1. Em `backend/src/config/`, adicionar `PAYMENT_PLACEHOLDER_BASE_URL`
     (default `https://pay.example.com`).
- **DoD:** env carregada no boot.

### T-04 — Repo: `createOrder` vira `pending`, `markStatus`, `addStatusEvent`, `findStatusEvents`

- **RF:** RF-03, RF-05, RF-11
- **Dependências:** T-02
- **Ações:**
  1. Em `backend/src/modules/orders/orders.repo.ts`:
     - `createOrder` agora insere `status='pending'`, `payment_status='pending'`.
     - `markStatus(orderId, status)` (genérico).
     - `addStatusEvent(orderId, status)`.
     - `findStatusEvents(orderId)` (ordenado por `created_at` ASC).
- **DoD:** funções tipadas e testáveis.

### T-05 — Payments: `buildPaymentUrl` (stub)

- **RF:** RF-10, AD-06
- **Dependências:** T-03
- **Ações:**
  1. Criar `backend/src/modules/payments/payments.service.ts`:
     - `buildPaymentUrl(orderId)` → `${env.PAYMENT_PLACEHOLDER_BASE_URL}/orders/${orderId}`.
- **DoD:** função pura, testada manualmente.

### T-06 — Service: `preview`

- **RF:** RF-01, RF-02, RF-04
- **Dependências:** T-01, T-04 (carrinho-de-compras concluído)
- **Ações:**
  1. Em `backend/src/modules/orders/orders.service.ts`:
     - `createOrderPreview(userId)`:
       - Chama `cartService.getCart(userId)` (já retorna totais + cupom + endereço).
       - Se `items.length === 0` → `{ error: "empty-cart" }`.
       - Mapeia para `OrderSummary` (sem `statusHistory`/`paymentStatus`).
       - Retorna `OrderSummary`.
- **DoD:** retorna totais corretos com cupom e frete.

### T-07 — Service: `confirm`

- **RF:** RF-05, RF-06, RF-07, RF-08
- **Dependências:** T-04, T-05
- **Ações:**
  1. Em `backend/src/modules/orders/orders.service.ts`:
     - `confirmOrder(orderId, userId)`:
       - Carrega pedido.
       - Se não existe → `404 not-found`.
       - Se `userId !== order.userId` → `403 forbidden`.
       - Se `status !== "pending"` → `409 invalid-status`.
       - `markStatus(orderId, "created")`.
       - `addStatusEvent(orderId, "confirmed")`.
       - `buildPaymentUrl(orderId)`.
       - Retorna `{ order, paymentUrl }`.
- **DoD:** transições válidas e inválidas cobertas.

### T-08 — Routes: `POST /orders/preview`, `POST /orders/:id/confirm`

- **RF:** RF-01..RF-08
- **Dependências:** T-06, T-07
- **Ações:**
  1. Em `backend/src/modules/orders/orders.route.ts`:
     - `POST /orders/preview` (authGuard) → `createOrderPreview`.
     - `POST /orders/:id/confirm` (authGuard) → `confirmOrder`.
- **DoD:** rotas registradas; status codes corretos.

### T-09 — GET /orders/:id com `statusHistory`; GET /orders com `paymentStatus`

- **RF:** RF-12, RF-13
- **Dependências:** T-04
- **Ações:**
  1. Em `backend/src/modules/orders/orders.service.ts`:
     - `getOrder(orderId, userId)` carrega `order` + `statusHistory`.
     - `listOrders(userId)` inclui `paymentStatus` em cada item.
- **DoD:** DTOs retornam os campos novos.

### T-10 — Script `db:mark-paid`

- **RF:** RF-14, AD-09
- **Dependências:** T-04
- **Ações:**
  1. Criar `backend/src/db/mark-paid.ts`:
     - Lê `orderId` de `process.argv[2]`.
     - `UPDATE orders SET payment_status='paid' WHERE id = $1`.
     - `addStatusEvent(orderId, "payment-received")`.
     - Loga resultado.
  2. Adicionar script npm `db:mark-paid`.
- **DoD:** o script marca `paid` e adiciona evento.

### T-11 — Atualizar testes existentes (POST /orders → pending)

- **RF:** RF-03
- **Dependências:** T-04
- **Ações:**
  1. Em `backend/tests/integration.test.ts`:
     - Atualizar o teste `creates order, decrements stock, clears cart, lists`:
       - Esperar `status="pending"` após `POST /orders`.
       - Adicionar `POST /orders/:id/confirm` e esperar `status="created"`.
- **DoD:** testes existentes passam com a nova semântica.

### T-12 — Testes de integração (novos cenários)

- **RF:** RF-01, RF-02, RF-05, RF-06, RF-07, RF-08, RF-12, RF-14
- **Dependências:** T-08, T-09, T-10, T-11
- **Ações:** em `backend/tests/integration.test.ts`, `describe("checkout")`:
  1. Preview com cart válido → `200 { summary }` com totais.
  2. Preview com cart vazio → `400 { error: "empty-cart" }`.
  3. `POST /orders` cria pedido com `status="pending"`.
  4. `POST /orders/:id/confirm` do próprio user → `200 { order, paymentUrl }`.
  5. `POST /orders/:id/confirm` em pedido já `created` → `409 invalid-status`.
  6. `POST /orders/:id/confirm` em pedido de outro user → `403 forbidden`.
  7. `POST /orders/:id/confirm` em pedido inexistente → `404 not-found`.
  8. `GET /orders/:id` retorna `statusHistory` com eventos `created` e `confirmed`.
  9. `db:mark-paid <id>` → `paymentStatus="paid"` + novo evento.
- **DoD:** suíte completa verde.

### T-13 — Validação final + evidência

- **RF:** todos
- **Dependências:** T-12
- **Ações:**
  1. `make lint` (0 erros).
  2. `make build` (tsc ok).
  3. `make test` (Postgres de pé).
  4. Evidência curl:
     - `POST /orders/preview` → `200 { summary }`.
     - `POST /orders` → `201 { order }` com `status="pending"`.
     - `POST /orders/:id/confirm` → `200 { order, paymentUrl }` (`status="created"`).
     - `POST /orders/:id/confirm` (segunda vez) → `409 invalid-status`.
     - `db:mark-paid <id>` → loga `payment_status=paid`.
     - `GET /orders/:id` → `statusHistory` com 3 eventos.
- **DoD:** lint/build/test verdes; evidência registrada.

## Evidência (preencher na T-13)

```text
<!-- curl outputs aqui -->
```

## Definition of Done da feature

- [ ] Migração aplicada e versionada.
- [ ] `Order`/`OrderSummary` DTOs com `paymentStatus`, `paymentUrl`, `statusHistory`.
- [ ] `POST /orders/preview` retorna resumo sem criar pedido.
- [ ] `POST /orders` cria pedido com `status="pending"`.
- [ ] `POST /orders/:id/confirm` transiciona para `created` e retorna `paymentUrl` placeholder.
- [ ] `GET /orders/:id` retorna `statusHistory`.
- [ ] Script `db:mark-paid` (stub) funcional.
- [ ] `make lint`, `make build`, `make test` verdes.
- [ ] Evidência curl registrada.
- [ ] Pasta movida `specs/to-do/` → `specs/wip/` → `specs/done/` conforme status.
