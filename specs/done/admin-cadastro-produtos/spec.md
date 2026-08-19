# Spec — Admin: cadastro de produtos (backend)

## Metadados

| Campo | Valor |
| --- | --- |
| Título | Admin: cadastro de produtos (backend) |
| Status | `aprovada` |
| Autor | Renan San |
| Data | 2026-08-19 |
| Versão | 0.1.0 |
| Links | [`plan.md`](./plan.md) · [`tasks.md`](./tasks.md) |

## Contexto / Motivação

O frontend `loja/` já implementou a página de cadastro de produtos
(`/admin/produtos/novo`) **a nível mock** (spec `cadastro-produtos` no repo do
frontend, commit `693355a`). O backend `be-loja` ainda não tem suporte a admin:

- `PublicUser` (em `shared/dto.ts`) não tem atributo `role`.
- Não existe `adminGuard` nem `POST /products`.
- O catálogo é somente leitura (`GET /products`, `GET /products/:id`).

Esta spec cobre o que falta no backend para a feature funcionar de verdade,
fechando o contrato já documentado no `plan.md` do frontend (AD-01, AD-02 e
tabela "Backend" de contratos).

## Objetivos

- Adicionar coluna `role` em `users` (`customer`/`admin`, default `customer`).
- Expor `role` no `PublicUser` (via `GET /auth/me`, login e register).
- Adicionar `POST /products` protegido por autorização de admin (`adminGuard`),
  como fonte de verdade da segurança.
- Invalidar o cache do catálogo após criar produto (o service usa cache de 60s).
- Prover forma de promover um usuário a admin (seed/script, sem UI).
- Manter `make lint`, `make build` e `make test` verdes.

## Non-Goals

- Editar, excluir, ativar/desativar produto e gestão de estoque (specs futuras).
- UI de promoção de usuário a admin (feito via script/seed no backend).
- Paginação do catálogo.
- Qualquer mudança no repo `loja/` (frontend tem repo próprio).

## User Stories

- Como **admin**, quero **criar produtos via `POST /products`**, para **adicionar
  novos produtos ao catálogo**.
- Como **cliente (não-admin)**, não devo conseguir **criar produtos**.
- Como **usuário anônimo**, não devo conseguir **criar produtos**.

## Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | A tabela `users` tem coluna `role` (`text`, valores `customer`/`admin`, default `customer`). |
| RF-02 | `PublicUser` (em `shared/dto.ts`) inclui `role: "admin" \| "customer"`. |
| RF-03 | `GET /auth/me`, login e register retornam `user` com `role`. |
| RF-04 | `POST /products` exige sessão válida e role `admin`; corpo `{ name, description, priceCents, color, stockQty }`; resposta `201 { product }`. |
| RF-05 | `POST /products` retorna `403 { error: "forbidden" }` para usuário logado não-admin. |
| RF-06 | `POST /products` retorna `401 { error: "unauthorized" }` para anônimo. |
| RF-07 | `POST /products` valida o corpo (zod) e retorna `400 { error: "validation" }` para corpo inválido. |
| RF-08 | Criar produto invalida o cache do catálogo (`listCache`/`byIdCache`). |
| RF-09 | Existe script/seed para promover um usuário existente a admin (sem UI). |

## Critérios de aceite

Cada requisito tem ao menos um cenário testável no formato GIVEN/WHEN/THEN.

**RF-01 — coluna `role`**

- GIVEN o schema `users` migrado, WHEN um usuário é criado sem informar `role`,
  THEN `role` é `"customer"`.
- GIVEN um usuário com `role` atualizado para `"admin"`, WHEN o registro é lido,
  THEN `role` é `"admin"`.

**RF-02/RF-03 — `role` no DTO e nas respostas**

- GIVEN um usuário logado, WHEN `GET /auth/me` é chamado, THEN a resposta traz
  `user.role` (`"admin"` ou `"customer"`).
- GIVEN um register/login, WHEN a resposta é retornada, THEN `user.role` está
  presente.

**RF-04 — criar produto (admin)**

- GIVEN um admin logado, WHEN `POST /products` é chamado com corpo válido,
  THEN retorna `201 { product }` com `active: true` e o produto aparece em
  `GET /products`.

**RF-05 — não-admin bloqueado**

- GIVEN um cliente logado, WHEN `POST /products` é chamado, THEN retorna
  `403 { error: "forbidden" }` e nenhum produto é criado.

**RF-06 — anônimo bloqueado**

- GIVEN nenhuma sessão, WHEN `POST /products` é chamado, THEN retorna
  `401 { error: "unauthorized" }`.

**RF-07 — validação**

- GIVEN um corpo inválido (ex.: `priceCents` negativo ou `name` vazio), WHEN
  `POST /products` é chamado por um admin, THEN retorna `400 { error: "validation" }`.

**RF-08 — cache invalidado**

- GIVEN o catálogo em cache, WHEN um produto é criado, THEN o próximo
  `GET /products` reflete o novo produto (sem esperar o TTL de 60s).

**RF-09 — promoção a admin**

- GIVEN um usuário existente, WHEN o script de promoção roda com o username,
  THEN o usuário passa a ter `role: "admin"` e consegue criar produtos.

## Casos de borda

- **Sessão expirada** ao chamar `POST /products`: `401 { error: "unauthorized" }`
  (mesmo comportamento do `authGuard` atual).
- **Nome duplicado**: o schema atual não tem unique em `products.name`; aceitar
  duplicados (sem validação extra nesta spec).
- **`priceCents`**: inteiro positivo; `stockQty`: inteiro >= 0; `color`: texto
  livre (classes tailwind do gradiente, como no seed atual).
- **Migração em banco existente**: `drizzle-kit generate` deve produzir um
  `ALTER TABLE` aditivo (coluna com default), sem perda de dados.

## Decisões tomadas

| # | Decisão | Justificativa |
| --- | --- | --- |
| DD-01 | `role` como `text` com default `"customer"` (sem enum no Postgres). | Simples; valores validados no zod/DTO; espelha o contrato do frontend. |
| DD-02 | `adminGuard` como middleware separado, composto após `authGuard`. | Reusa a verificação de sessão existente; `authGuard` já seta `userId` no contexto. |
| DD-03 | Promoção a admin via script `db:promote-admin <username>`. | Sem UI (non-goal); permite testar o fluxo admin de ponta a ponta. |
| DD-04 | `POST /products` retorna `201` (recurso criado). | Padrão REST; register já usa `201`. |
| DD-05 | Erro de validação com código `validation`. | Segue o padrão `{ error: "<código>" }` da constitution §2. |

## Decisões em aberto

- Nenhuma. O contrato foi fechado com o frontend (`plan.md` do frontend,
  tabela "Backend").