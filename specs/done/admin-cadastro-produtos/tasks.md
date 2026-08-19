# Tasks — Admin: cadastro de produtos (backend)

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

### T-01 — Schema: coluna `role` em `users` + migração

- **RF:** RF-01
- **Dependências:** nenhuma
- **Ações:**
  1. Em `backend/src/db/schema.ts`, adicionar em `users`:
     `role: text("role").notNull().default("customer")`.
  2. Rodar `npm run db:generate` (em `backend/`) e conferir que a migração é um
     `ALTER TABLE` aditivo.
  3. Aplicar com `make migrate` e conferir `\d users` (psql) ou equivalente.
- **DoD:** migração SQL versionada em `src/db/migrations/`; coluna presente com
  default `customer`.

### T-02 — DTO: `role` no `PublicUser`

- **RF:** RF-02
- **Dependências:** T-01
- **Ações:**
  1. Em `shared/dto.ts`, adicionar `role: "admin" | "customer"` em `PublicUser`.
  2. Em `backend/src/modules/auth/auth.service.ts`, incluir `role` em
     `toPublicUser` (vem de `user.role`).
- **DoD:** `GET /auth/me`, login e register retornam `user.role`.

### T-03 — Middleware `adminGuard`

- **RF:** RF-04, RF-05
- **Dependências:** T-02
- **Ações:**
  1. Criar `backend/src/middleware/admin-guard.ts`:
     - Lê `c.get("userId")` (setado pelo `authGuard`).
     - Busca o usuário (reusar `getUserById` de `auth.service`).
     - Se não for `role === "admin"`, retorna `403 { error: "forbidden" }`.
     - Caso contrário, `next()`.
- **DoD:** middleware exportado e testável; não duplica verificação de sessão.

### T-04 — `POST /products` (route + service + repo)

- **RF:** RF-04, RF-06, RF-07, RF-08
- **Dependências:** T-03
- **Ações:**
  1. Em `products.route.ts`, adicionar `POST /` com `authGuard, adminGuard`:
     - `createProductSchema` (zod): `name` (trim, 1–200), `description` (trim,
       1–2000), `priceCents` (int, positivo), `color` (trim, 1–100),
       `stockQty` (int, >= 0).
     - Corpo inválido → `400 { error: "validation" }`.
     - Sucesso → `201 { product }`.
  2. Em `products.service.ts`, adicionar `createProduct(input)` que chama o repo
     e depois `clearCache()`.
  3. Em `products.repo.ts`, adicionar `create(input)` (insert com `active: true`
     default do schema, `returning()`).
- **DoD:** curl de admin cria produto e `GET /products` reflete imediatamente
  (cache invalidado).

### T-05 — Script de promoção a admin

- **RF:** RF-09
- **Dependências:** T-01
- **Ações:**
  1. Criar `backend/src/db/promote-admin.ts`:
     - Lê `username` de `process.argv[2]`.
     - `UPDATE users SET role = 'admin' WHERE username = $1`.
     - Loga resultado (usuário promovido ou não encontrado).
  2. Adicionar script npm `db:promote-admin` em `backend/package.json`.
- **DoD:** `npm run db:promote-admin -- <username>` promove o usuário e ele
  consegue criar produto.

### T-06 — Testes (unit + integração)

- **RF:** RF-04, RF-05, RF-06, RF-07, RF-08
- **Dependências:** T-04, T-05
- **Ações:** em `backend/tests/integration.test.ts`, cobrir:
  1. Admin cria produto → `201 { product }` e aparece em `GET /products`.
  2. Cliente (não-admin) → `403 { error: "forbidden" }`.
  3. Anônimo → `401 { error: "unauthorized" }`.
  4. Corpo inválido (ex.: `priceCents` negativo) → `400 { error: "validation" }`.
  5. Cache invalidado: criar produto e conferir que `GET /products` o inclui.
- **DoD:** novos cenários passando; suíte completa verde.

### T-07 — Validação final + evidência

- **RF:** todos
- **Dependências:** T-06
- **Ações:**
  1. `make lint` (erros zerados).
  2. `make build` (tsc ok).
  3. `make test` (Postgres de pé).
  4. Evidência via curl (registrar no final deste arquivo):
     - register/login de um usuário → `role: "customer"`.
     - `db:promote-admin` → `GET /auth/me` com `role: "admin"`.
     - `POST /products` admin → `201`; não-admin → `403`; anônimo → `401`.
- **DoD:** lint/build/test verdes; evidência curl registrada abaixo.

## Evidência (preencher na T-07)

```text
=== Ambiente ===
- Postgres: porta 5433, schema migrado (0001_superb_miek.sql)
- API: http://localhost:3001 (make dev)

=== 1. register (customer) → user.role = "customer" ===
$ curl -s -c /tmp/cookies-user.txt -X POST http://localhost:3001/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"ivan","password":"segredo123"}'
{"user":{"id":"c2cbf1b8-f6c1-4396-b327-dacdc26354e6","username":"ivan","role":"customer","createdAt":"2026-08-19T17:58:09.514Z"}}

=== 2. GET /auth/me (customer) ===
$ curl -s -b /tmp/cookies-user.txt http://localhost:3001/auth/me
{"user":{"id":"c2cbf1b8-f6c1-4396-b327-dacdc26354e6","username":"ivan","role":"customer","createdAt":"2026-08-19T17:58:09.514Z"}}

=== 3. db:promote-admin ivan ===
$ npm run db:promote-admin -- ivan
usuário promovido: {"id":"c2cbf1b8-f6c1-4396-b327-dacdc26354e6","username":"ivan","role":"admin"}

=== 4. GET /auth/me after promote (admin) ===
$ curl -s -b /tmp/cookies-user.txt http://localhost:3001/auth/me
{"user":{"id":"c2cbf1b8-f6c1-4396-b327-dacdc26354e6","username":"ivan","role":"admin","createdAt":"2026-08-19T17:58:09.514Z"}}

=== 5. POST /products (admin) → 201 ===
$ curl -s -b /tmp/cookies-user.txt -X POST http://localhost:3001/products \
    -H "Content-Type: application/json" \
    -d '{"name":"Camiseta Polo","description":"Camiseta polo piqué","priceCents":9990,"color":"from-emerald-500/30 to-teal-600/30","stockQty":5}'
{"product":{"id":"365a7554-e277-4397-b076-b810bb4cd08a","name":"Camiseta Polo","description":"Camiseta polo piqué","priceCents":9990,"color":"from-emerald-500/30 to-teal-600/30","stockQty":5,"active":true,"createdAt":"2026-08-19T17:58:26.160Z"}}
HTTP 201

=== 6. GET /products (cache invalidado: novo produto aparece) ===
$ curl -s http://localhost:3001/products
{"products":[
  "Moletom Oversized","Boné Clássico","Mochila Compacta","Relógio Minimal",
  "Camiseta Básica","Tênis Urban","Camiseta Polo"
]}
Total: 7 (6 seed + 1 criado)

=== 7. register cliente (não-admin) ===
$ curl -s -c /tmp/cookies-customer.txt -X POST http://localhost:3001/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"joao","password":"segredo123"}'
{"user":{"id":"8838920a-1460-4e3c-aa3e-137a736e21ef","username":"joao","role":"customer","createdAt":"2026-08-19T17:58:26.265Z"}}

=== 8. POST /products (não-admin) → 403 forbidden ===
$ curl -s -b /tmp/cookies-customer.txt -X POST http://localhost:3001/products \
    -H "Content-Type: application/json" \
    -d '{"name":"Outro","description":"x","priceCents":1000,"color":"x","stockQty":0}'
{"error":"forbidden"}
HTTP 403

=== 9. POST /products (anônimo) → 401 unauthorized ===
$ curl -s -X POST http://localhost:3001/products \
    -H "Content-Type: application/json" \
    -d '{"name":"Outro","description":"x","priceCents":1000,"color":"x","stockQty":0}'
{"error":"unauthorized"}
HTTP 401

=== 10. POST /products (admin, corpo inválido) → 400 validation ===
$ curl -s -b /tmp/cookies-user.txt -X POST http://localhost:3001/products \
    -H "Content-Type: application/json" \
    -d '{"name":"","description":"x","priceCents":-1,"color":"x","stockQty":0}'
{"error":"validation"}
HTTP 400

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
      Tests  25 passed (25)
   Duration  3.39s
```

## Status final

- **T-01** ✅ Schema: `role` em `users` + migração `0001_superb_miek.sql`
- **T-02** ✅ DTO: `role` em `PublicUser` + `toPublicUser`
- **T-03** ✅ Middleware `adminGuard`
- **T-04** ✅ `POST /products` (route + service + repo) com cache invalidado
- **T-05** ✅ Script `db:promote-admin` + npm script
- **T-06** ✅ 5 cenários de integração verdes (admin, não-admin, anônimo, validação, role)
- **T-07** ✅ lint + build + test verdes; evidência curl registrada

## Definition of Done da feature

- [ ] Migração aplicada e versionada.
- [ ] `role` no DTO e nas respostas de auth.
- [ ] `POST /products` protegido por `adminGuard` com erros corretos.
- [ ] Cache invalidado após criar produto.
- [ ] Script `db:promote-admin` funcional.
- [ ] `make lint`, `make build`, `make test` verdes.
- [ ] Evidência curl registrada.
- [ ] Pasta movida `specs/to-do/` → `specs/wip/` → `specs/done/` conforme status.