# Plano — Tela de checkout (sem pagamento)

## Metadados

| Campo | Valor |
| --- | --- |
| Referência | [`spec.md`](./spec.md) |
| Status | `aprovada` |
| Versão | 0.1.0 |
| Data | 2026-08-19 |
| Dependências | `specs/to-do/carrinho-de-compras/` (DD-04, AD-04b) |

## Decisões técnicas

| # | Decisão | Justificativa |
| --- | --- | --- |
| AD-01 | `orders` ganha `payment_status text NOT NULL DEFAULT 'pending'` e `payment_url text NULL`. | RF-09; status separam lifecycle de pedido e pagamento. |
| AD-02 | Nova tabela `order_status_events` (`id`, `order_id` FK, `status` text, `created_at` default now()). | RF-11; audit trail. |
| AD-03 | `POST /orders` continua criando pedido, mas agora com `status="pending"` (DD-01). | RF-03. |
| AD-04 | `POST /orders/preview` (RF-01): reusa `cartService.getCart` (que já retorna `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`, `coupon`, `shippingAddress`); frete via `shippingService.quote`. | Sem inserir pedido; reusa o que `carrinho-de-compras` já consolidou. |
| AD-05 | `POST /orders/:id/confirm` (RF-05): valida ownership, valida status=`pending`, `UPDATE orders SET status='created'`, gera `paymentURL` placeholder, insere evento `confirmed`. | Transição explícita + audit. |
| AD-06 | `paymentUrl` placeholder: `https://pay.example.com/orders/{id}` (constante configurável via env `PAYMENT_PLACEHOLDER_BASE_URL`). | RF-10; substitui quando integrarmos. |
| AD-07 | `GET /orders/:id` retorna `order` + `statusHistory` (lista de eventos ordenada por `created_at` ASC). | RF-12. |
| AD-08 | `GET /orders` mantém o array, mas cada item inclui `paymentStatus` e `paymentUrl`. | RF-13. |
| AD-09 | Script `db:mark-paid <order_id>` (RF-14): `UPDATE orders SET payment_status='paid'`, insere evento `payment-received` (status permanece `created`). | Stub explícito. |
| AD-10 | Erros com códigos estáveis: `empty-cart`, `invalid-status`, `forbidden`, `not-found`. | Constitution §2. |
| AD-11 | Sem dependências novas. | Constitution §4. |
| AD-12 | Migração aditiva via `drizzle-kit generate`. | Constitution §3. |

## Contratos de dados / API

### Schema (migrações)

| Tabela | Mudança |
| --- | --- |
| `orders` | `+ payment_status text NOT NULL DEFAULT 'pending'`, `+ payment_url text NULL`. |
| `order_status_events` | NOVA. |

### DTO (`shared/dto.ts`)

```ts
export type OrderStatus = "pending" | "created" | "cancelled" | "shipped" | "delivered";
export type PaymentStatus = "pending" | "paid" | "failed";

export type OrderStatusEvent = {
  id: string;
  status: string;
  createdAt: string;
};

export type Order = {
  id: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentUrl: string | null;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
  statusHistory: OrderStatusEvent[];
};

export type OrderSummary = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  items: Array<{
    productId: string;
    name: string;
    unitPriceCents: number;
    qty: number;
  }>;
  shippingAddress: PublicAddress | null;
};
```

### Endpoints

| Método | Caminho | Auth | Entrada | Saída | Erros |
| --- | --- | --- | --- | --- | --- |
| POST | `/orders/preview` | cookie | – | `200 { summary: OrderSummary }` | `400 {error:"empty-cart"}` |
| POST | `/orders` | cookie | – | `201 { order: Order }` (status: pending) | `400 {error:"empty-cart"}` · `400 {error:"stock"}` |
| POST | `/orders/:id/confirm` | cookie | – | `200 { order: Order, paymentUrl: string }` | `403 {error:"forbidden"}` · `404 {error:"not-found"}` · `409 {error:"invalid-status"}` |
| GET | `/orders/:id` | cookie | – | `200 { order: Order }` (com statusHistory) | `403` · `404` |
| GET | `/orders` | cookie | – | `200 { orders: Order[] }` (cada um com paymentStatus) | `401` |

### Validação

- `idSchema` (já existe): `z.string().uuid()`.
- Sem body novo (preview e confirm não recebem payload).

## Módulos / arquivos afetados

| Arquivo | Mudança |
| --- | --- |
| `shared/dto.ts` | `OrderStatus`, `PaymentStatus`, `OrderStatusEvent`, `Order`, `OrderSummary`. |
| `backend/src/db/schema.ts` | `orders` (+ payment_status, payment_url), `order_status_events` (nova). |
| `backend/src/db/migrations/` | Nova migração. |
| `backend/src/modules/orders/orders.route.ts` | `POST /orders/preview`, `POST /orders/:id/confirm`. |
| `backend/src/modules/orders/orders.service.ts` | `preview(userId)`, `confirm(orderId, userId)`, `getOrder` com `statusHistory`. |
| `backend/src/modules/orders/orders.repo.ts` | `createOrder` agora status=`pending`, `markStatus`, `addStatusEvent`, `findStatusEvents`. |
| `backend/src/modules/payments/payments.service.ts` (novo) | `buildPaymentUrl(orderId)` (placeholder). |
| `backend/src/db/mark-paid.ts` (novo) | Script `db:mark-paid`. |
| `backend/src/config/index.ts` | `PAYMENT_PLACEHOLDER_BASE_URL` (default `https://pay.example.com`). |
| `backend/package.json` | Script `db:mark-paid`. |
| `backend/tests/integration.test.ts` | Cenários: preview, POST /orders pending, confirm, ownership, status history, db:mark-paid. |

## Fluxos

**Preview:** `POST /orders/preview` → chama `cartService.getCart(userId)` (que
já agrega itens + cupom + endereço + frete) → se vazio → `400 empty-cart` →
mapeia para `OrderSummary` (sem `statusHistory`/`paymentStatus`) → retorna.

**Criar pedido (pending):** `POST /orders` → valida cart (não-vazio, estoque) →
transação: cria `order` com `status="pending"`, snapshot itens, limpa cart,
insere evento `created` em `order_status_events` → retorna `Order`.

**Confirmar:** `POST /orders/:id/confirm` → carrega pedido → valida ownership
(403 `forbidden`) → valida `status="pending"` (409 `invalid-status`) →
`UPDATE orders SET status='created'` → insere evento `confirmed` →
gera `paymentUrl` placeholder → retorna `{ order, paymentUrl }`.

**Marcador de pagamento (stub):** `db:mark-paid <id>` → `UPDATE orders SET
payment_status='paid'` → insere evento `payment-received` (status permanece
`created`).

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Breaking change: `POST /orders` muda de `created` para `pending` | Testes existentes atualizados; spec registra explicitamente (DD-01). |
| Estoque reservado em `pending` sem TTL | Fora de escopo; documentado como spec futura. |
| `paymentUrl` placeholder usado em produção | Validação no boot (env `PAYMENT_PLACEHOLDER_BASE_URL` sinaliza stub). |
| Frontend acopla em `paymentUrl` real | Contrato é `string`; trocar pelo real é trivial. |

## Fora de escopo

- Integração com meio de pagamento real (Stripe, Mercado Pago, etc.).
- Webhook de pagamento.
- Cancelamento, estorno, alteração de itens após `created`.
- TTL de pedidos `pending`.
- Multi-step server-side (estado de checkout).
- Notificação por e-mail / SMS.
