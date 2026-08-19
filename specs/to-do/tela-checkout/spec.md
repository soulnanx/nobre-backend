# Spec — Tela de checkout (sem pagamento)

## Metadados

| Campo | Valor |
| --- | --- |
| Título | Tela de checkout (preview, confirmação, stub de pagamento) |
| Status | `aprovada` |
| Autor | Renan San |
| Data | 2026-08-19 |
| Versão | 0.1.0 |
| Links | [`plan.md`](./plan.md) · [`tasks.md`](./tasks.md) |
| Dependências | `specs/to-do/carrinho-de-compras/` (frete, cupom, endereço) |

## Contexto / Motivação

O backend `be-loja` já tem `POST /orders` (checkout transacional) que cria o
pedido com `status="created"`. Falta o que a UI de checkout precisa:

- **Preview antes de fechar**: o frontend quer mostrar o resumo (subtotal,
  frete, desconto, total) sem ainda criar o pedido.
- **Fluxo de 2 etapas**: criar pedido em estado `pending` (reservando
  estoque), depois confirmar → `created`. Permite "voltar" sem perder o pedido.
- **Stub de pagamento**: o pedido precisa carregar `paymentStatus` e
  `paymentUrl` (placeholder) para que a UI mostre "pagar agora" e, quando
  integrarmos com um meio de pagamento, só plugar o provedor.
- **Status do pedido + histórico**: a UI de "meus pedidos" precisa de timeline
  e status atual.

Esta spec **não** integra com nenhum meio de pagamento real (explicitamente
fora de escopo). O `paymentUrl` é placeholder; `paymentStatus` começa em
`pending` e vai para `paid` apenas via stub/script.

Dependência: `carrinho-de-compras` (frete, cupom, endereço) deve estar
implementada (DD-04 e AD-04b) para que o checkout agregue esses totais.

## Objetivos

- Adicionar `POST /orders/preview` que retorna o resumo (subtotal, frete,
  desconto, total, itens, endereço) sem criar o pedido.
- Mudar `POST /orders` para criar pedido com `status="pending"` (em vez de
  `created`).
- Adicionar `POST /orders/:id/confirm` que transiciona `pending → created`
  e retorna `paymentUrl` (placeholder).
- Adicionar `paymentStatus` (`pending`/`paid`/`failed`) e `paymentUrl` em
  `orders`.
- Adicionar timeline de status em `GET /orders/:id` (lista de eventos).
- Manter `make lint` + `make build` + `make test` verdes.

## Non-Goals

- Integração com meio de pagamento real (Stripe, Mercado Pago, etc.).
- Webhook de pagamento.
- Estorno, cancelamento, alteração de pedido após `created`.
- Multi-step UI server-side (estado de navegação).
- Pedido de visitante (anônimo).

## User Stories

- Como **cliente**, quero **ver o resumo do pedido antes de confirmar**, para
  **revisar valores e endereço**.
- Como **cliente**, quero **confirmar o pedido em duas etapas**, para **ter
  chance de revisar antes de fechar**.
- Como **cliente**, quero **saber o status do meu pedido**, para **acompanhar
  o processamento**.
- Como **sistema**, quero **deixar o pagamento plugável**, para **integrar com
  um provedor real em spec futura sem refatorar o fluxo**.

## Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | `POST /orders/preview` retorna `{ subtotalCents, discountCents, shippingCents, totalCents, items, shippingAddress }` sem criar pedido. |
| RF-02 | `POST /orders/preview` retorna `400 { error: "empty-cart" }` se cart vazio. |
| RF-03 | `POST /orders` passa a criar pedido com `status="pending"` (mudança compatível com spec atual). |
| RF-04 | `POST /orders/preview` exige cart não-vazio, com `shipping_address` definido (DD-04). |
| RF-05 | `POST /orders/:id/confirm` transiciona `pending → created`; retorna `{ order, paymentUrl }`. |
| RF-06 | `POST /orders/:id/confirm` retorna `409 { error: "invalid-status" }` se pedido não está em `pending`. |
| RF-07 | `POST /orders/:id/confirm` retorna `403 { error: "forbidden" }` se o pedido não pertence ao usuário. |
| RF-08 | `POST /orders/:id/confirm` retorna `404 { error: "not-found" }` se pedido inexistente. |
| RF-09 | `orders` ganha `payment_status` (`pending`/`paid`/`failed`, default `pending`) e `payment_url` (text nullable). |
| RF-10 | `paymentUrl` em `confirm` é placeholder determinístico (`https://pay.example.com/orders/{id}`) — explicitamente stub. |
| RF-11 | `orders` ganha `status_history` (tabela nova `order_status_events`) com `order_id`, `status`, `created_at`. |
| RF-12 | `GET /orders/:id` retorna `order` + `statusHistory` (lista ordenada). |
| RF-13 | `GET /orders` mantém listagem simples, mas cada item inclui `paymentStatus` e `paymentUrl`. |
| RF-14 | Script `db:mark-paid <order_id>` (stub) marca `payment_status='paid'` e adiciona evento ao histórico. |

## Critérios de aceite

**RF-01 — preview**

- GIVEN cart com itens, cupom, endereço, WHEN `POST /orders/preview` é chamado,
  THEN retorna `200 { subtotalCents, discountCents, shippingCents, totalCents, items, shippingAddress }` sem criar pedido.

**RF-02 — preview com cart vazio**

- GIVEN cart vazio, WHEN `POST /orders/preview` é chamado, THEN retorna
  `400 { error: "empty-cart" }`.

**RF-03 — POST /orders vira pending**

- GIVEN cart válido, WHEN `POST /orders` é chamado, THEN cria pedido com
  `status="pending"` e `paymentStatus="pending"`.

**RF-05 — confirm**

- GIVEN pedido `pending` do usuário, WHEN `POST /orders/:id/confirm` é chamado,
  THEN retorna `200 { order, paymentUrl }` com `status="created"` e adiciona
  evento ao `statusHistory`.

**RF-06 — confirm inválido**

- GIVEN pedido já `created`, WHEN `POST /orders/:id/confirm` é chamado, THEN
  retorna `409 { error: "invalid-status" }`.

**RF-07 — confirm de outro usuário**

- GIVEN pedido de outro user, WHEN `POST /orders/:id/confirm` é chamado, THEN
  retorna `403 { error: "forbidden" }`.

**RF-12 — status history**

- GIVEN pedido criado, confirmado, WHEN `GET /orders/:id` é chamado, THEN
  `statusHistory` contém eventos `created` (pending) e `confirmed` (created)
  em ordem cronológica.

**RF-14 — stub de pagamento**

- GIVEN pedido `created`, WHEN `db:mark-paid <id>` roda, THEN
  `paymentStatus="paid"` e novo evento adicionado.

## Casos de borda

- **Confirm de pedido expirado** (TTL): fora de escopo desta spec.
- **Webhook de pagamento**: não existe; o `paymentStatus` só muda via script
  stub (`db:mark-paid`).
- **Idempotência de confirm**: `409 invalid-status` em segunda chamada.
- **Mudança de `POST /orders`**: testes existentes (que esperam `created`)
  precisam ser atualizados para verificar `pending` na criação e `created`
  após `confirm`.
- **`paymentUrl`**: sempre placeholder; documentado como stub.

## Decisões tomadas

| # | Decisão | Justificativa |
| --- | --- | --- |
| DD-01 | `POST /orders` muda para criar `pending` (breaking change interna). | Permite fluxo de 2 etapas; testes serão atualizados. |
| DD-02 | Preview como endpoint próprio (`POST /orders/preview`) em vez de `GET /cart/checkout`. | Mantém o cart focado em CRUD; preview é uma "simulação" de pedido. |
| DD-03 | Confirm como `POST /orders/:id/confirm` (ação, não PATCH). | Estilo REST de "ação" (`/confirm`); PATCH ficaria com payload ambíguo. |
| DD-04 | `paymentStatus` separado de `status` do pedido. | Status do pedido = lifecycle (`pending`/`created`); paymentStatus = lifecycle do pagamento. |
| DD-05 | Status history como tabela `order_status_events`. | Audit trail; permite futura timeline na UI. |
| DD-06 | `paymentUrl` placeholder determinístico. | Stub claro; substituído por URL real na spec de integração futura. |
| DD-07 | Sem webhook / sem scheduler de expiração. | Mantém o escopo enxuto; sem dependências novas. |
| DD-08 | Script `db:mark-paid` como única forma de avançar `paymentStatus` nesta spec. | Stub explícito; o pagamento real virá depois. |

## Decisões em aberto

- Nenhuma. O escopo foi delimitado nas perguntas de brainstorming (preview,
  confirmação em 2 etapas, stub de pagamento, status + histórico).
