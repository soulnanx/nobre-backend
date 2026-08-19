# Spec — Carrinho de compras (melhorias)

## Metadados

| Campo | Valor |
| --- | --- |
| Título | Carrinho de compras (cupom, endereço, frete, expiração) |
| Status | `aprovada` |
| Autor | Renan San |
| Data | 2026-08-19 |
| Versão | 0.1.0 |
| Links | [`plan.md`](./plan.md) · [`tasks.md`](./tasks.md) |

## Contexto / Motivação

O backend `be-loja` já tem o módulo `cart` (GET/POST /cart, PATCH/DELETE
/cart/:productId, DELETE /cart) e `orders` (POST /orders com checkout
transacional). Falta, no entanto, o que o frontend precisa para uma tela de
carrinho e checkout reais:

- **Cupom de desconto**: não há `coupons`; `cart` não tem `discountCents`.
- **Endereço de entrega**: não há `addresses`; pedidos não carregam endereço.
- **Frete**: não há cálculo; `cart.totalCents` é só `subtotalCents`.
- **Expiração**: carrinho nunca expira; itens podem ficar "presos" para sempre.

Esta spec cobre essas lacunas no backend, mantendo o contrato do carrinho já
existente e adicionando os campos/endpoints necessários para a UI de carrinho
do frontend (e, na spec `tela-checkout`, o preview do checkout).

## Objetivos

- Adicionar `coupons` (código, tipo `%` ou fixo em centavos, validade, ativo).
- Aplicar cupom ao carrinho: `POST /cart/coupon` / `DELETE /cart/coupon`.
- Adicionar `addresses` (vinculado ao usuário, reutilizável).
- Definir endereço de entrega do carrinho: `PUT /cart/shipping-address`.
- Calcular frete (stub) por CEP/subtotal: `GET /shipping/quote`.
- Refletir desconto, endereço e frete em `GET /cart` (novos campos no DTO).
- Expirar carrinho automaticamente após 7 dias de inatividade (cleanup).
- Manter `make lint` + `make build` + `make test` verdes.

## Non-Goals

- Integração com transportadora real (Correios, etc.). O frete é um **stub**.
- Múltiplos endereços por usuário (um por cart; o CRUD completo de endereços
  fica para spec futura).
- Carrinho compartilhado entre usuários.
- Carrinho de visitante (anônimo) — só para usuários autenticados.
- Cupom de primeira compra, cupom por usuário, limite de uso.
- Estorno / alteração de pedido após `created` (cobre a spec `tela-checkout`).

## User Stories

- Como **cliente**, quero **aplicar um cupom ao meu carrinho**, para **receber
  um desconto no subtotal**.
- Como **cliente**, quero **informar o endereço de entrega**, para **calcular o
  frete e preencher o pedido**.
- Como **cliente**, quero **saber o frete antes de fechar o pedido**, para
  **decidir se prossigo**.
- Como **cliente**, quero **ver o total com desconto + frete**, para **saber
  quanto vou pagar**.
- Como **sistema**, quero **expirar carrinhos antigos**, para **não manter
  reservas indefinidas de `stockQty` (a ser modelado) e liberar dados**.

## Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | Tabela `coupons` (`code` único, `discount_type` `percent`/`fixed`, `discount_value`, `expires_at`, `active`, `min_subtotal_cents` opcional). |
| RF-02 | Tabela `addresses` (`user_id` FK, `cep`, `street`, `number`, `city`, `state`, `complement` opcional). |
| RF-03 | `cart_items` ganha `added_at` (timestamp) para suportar TTL. |
| RF-04 | `cart` (ou `cart_items`) ganha referência ao `coupon` aplicado e ao `shipping_address`. |
| RF-05 | `POST /cart/coupon` (`{ code }`) aplica cupom válido; retorna `200 { cart }`. |
| RF-06 | `DELETE /cart/coupon` remove cupom; retorna `200 { cart }`. |
| RF-07 | `PUT /cart/shipping-address` (`{ address }`) define o endereço de entrega do cart; retorna `200 { cart }`. |
| RF-08 | `GET /shipping/quote?cep=...&subtotalCents=...` retorna `{ shippingCents }` (stub). |
| RF-09 | `GET /cart` retorna `cart` com `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`, `coupon`, `shippingAddress`. |
| RF-10 | Cupom inválido/expirado/inativo → `400 { error: "invalid-coupon" }`. |
| RF-11 | Endereço com campos inválidos → `400 { error: "validation" }`. |
| RF-12 | Cupom exige `subtotalCents >= min_subtotal_cents` (se configurado); caso contrário `400 { error: "invalid-coupon" }`. |
| RF-13 | Cleanup automático de `cart_items` com `added_at` mais antigo que 7 dias (lazy: a cada `GET /cart` e/ou via script `db:clean-carts`). |
| RF-14 | Script `db:seed-coupons` opcional para popular cupons de exemplo. |

## Critérios de aceite

**RF-01/RF-05 — aplicar cupom**

- GIVEN um cupom válido (`active=true`, não expirado, `subtotal >= min`), WHEN
  `POST /cart/coupon` é chamado, THEN `cart.discountCents` reflete o desconto
  e `cart.coupon.code` está presente.

**RF-10 — cupom inválido**

- GIVEN cupom inexistente, expirado, inativo ou com subtotal abaixo do mínimo,
  WHEN `POST /cart/coupon` é chamado, THEN retorna `400 { error: "invalid-coupon" }`.

**RF-06 — remover cupom**

- GIVEN um cupom aplicado, WHEN `DELETE /cart/coupon` é chamado, THEN
  `cart.discountCents = 0` e `cart.coupon = null`.

**RF-02/RF-07 — endereço de entrega**

- GIVEN um endereço válido, WHEN `PUT /cart/shipping-address` é chamado, THEN
  `cart.shippingAddress` é persistido e retornado em `GET /cart`.
- GIVEN campos inválidos (CEP no formato errado, `state` com mais de 2 chars),
  WHEN `PUT /cart/shipping-address` é chamado, THEN retorna `400 { error: "validation" }`.

**RF-08 — frete**

- GIVEN um CEP e subtotal, WHEN `GET /shipping/quote` é chamado, THEN retorna
  `{ shippingCents }` (stub: regra simples por faixa de CEP ou por subtotal).

**RF-09 — totais no GET /cart**

- GIVEN cupom + endereço + frete, WHEN `GET /cart` é chamado, THEN `cart`
  inclui `subtotalCents`, `discountCents`, `shippingCents`, `totalCents` =
  `subtotal - discount + shipping`.

**RF-13 — expiração**

- GIVEN um `cart_item` com `added_at` > 7 dias atrás, WHEN o cleanup roda, THEN
  a linha é removida. Carrinho vazio após cleanup = deletado pelo reset.

## Casos de borda

- **Pedidos existentes**: `cart_items` passa a ter `added_at NOT NULL DEFAULT NOW()`
  (ALTER TABLE aditivo), sem perda de dados.
- **Cupom `percent`**: `discountCents = round(subtotal * value / 100)`.
- **Cupom `fixed`**: `discountCents = min(value, subtotal)` (nunca negativo).
- **CEP**: validação zod `^[0-9]{5}-?[0-9]{3}$`; aceita com ou sem hífen.
- **Frete**: se CEP não casar com nenhuma regra, retorna `shippingCents = 0`
  (ou número configurável; documentado no plan).
- **Race conditions**: aplicação de cupom é transacional (`UPDATE cart` com
  `WHERE coupon_id IS NULL` ou só atualiza — idempotente por escopo).
- **Cleanup**: idempotente; pode ser chamado múltiplas vezes sem efeito.

## Decisões tomadas

| # | Decisão | Justificativa |
| --- | --- | --- |
| DD-01 | `coupons` como tabela própria (não enum). | Cupons têm validade, valor e regras próprias; flexibilidade para futuras. |
| DD-02 | `addresses` separado de `users` (1:N). | Reutilizável no checkout e em futuros pedidos salvos. |
| DD-03 | Um endereço por cart (não lista). | Spec cobre o caso simples; multi-endereço é non-goal. |
| DD-04 | Frete via `GET /shipping/quote` (não persistido no cart). | Mantém o cart leve; o frete é recalculado a cada preview/checkout. |
| DD-05 | Cleanup lazy (no `GET /cart`) e command-line (`db:clean-carts`). | Sem cron/Redis; respeita "sem dependências novas" (constitution §4). |
| DD-06 | TTL de 7 dias, configurável via env (`CART_TTL_DAYS`). | Padrão razoável; ajustável. |
| DD-07 | `cart.totalCents` continua existindo; ganha `discountCents`/`shippingCents`. | Mantém contrato existente; fronts antigos continuam funcionando. |
| DD-08 | Erros com código estável (`invalid-coupon`, `validation`). | Segue constitution §2. |

## Decisões em aberto

- Nenhuma. O escopo foi delimitado nas perguntas de brainstorming (cupom,
  endereço, frete stub, expiração).
