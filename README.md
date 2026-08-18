# Loja — Backend

Backend HTTP da Loja (Fase 1), serviço independente consumido pelo frontend
Next.js. Substitui a persistência atual (`data/users.json` + produtos hardcoded
no `/home`) por uma API tipada sobre PostgreSQL.

Stack: **Node.js 22 + TypeScript 5 (strict) + Hono + PostgreSQL 16 + Drizzle ORM + zod + vitest**.

---

## 1. O que está implementado

- **Auth** — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
  Senha com hash **scrypt async** (formato `salt:hash`, salt 16 bytes hex, keylen
  64 — compatível com o front atual). Sessão por token opaco em tabela `sessions`
  (revogável no logout), cookie `session` `httpOnly`/`sameSite=lax`.
  Rate-limit in-memory (sliding window): register 5/min e login 10/min por IP.
- **Products** — `GET /products`, `GET /products/:id`. Retorna apenas `active=true`.
  **Cache in-memory com TTL de 60s** no catálogo.
- **Cart** — `GET/POST /cart`, `PATCH/(DELETE) /cart/:productId`, `DELETE /cart`.
  Adicionar item já existente incrementa a quantidade; nunca excede `stockQty`
  (erro `stock`).
- **Orders** — `POST /orders`, `GET /orders`, `GET /orders/:id`. O `POST` é
  **transacional**: valida estoque, decrementa `stockQty`, cria `order` +
  `order_items` (snapshot nome/preço), limpa o carrinho. Estoque insuficiente →
  rollback total + `{ error: "stock" }`. Carrinho vazio → `{ error: "empty-cart" }`.

Formato de erro padrão: `{ "error": "<código>espaço" }` com status HTTP correto.
Saída de `product.priceCents`/`order.totalCents`/`unitPriceCents` em centavos (int).

## 2. Arquitetura

```
be-loja/
├── SPEC.md                 # especificação de referência
├── backend/                # servidor Hono + Postgres
│   ├── src/
│   │   ├── config/         # env validado via zod (falha rápida no boot)
│   │   ├── db/             # schema (Drizzle), client (pg Pool), migrations, seed
│   │   ├── middleware/     # request-id, logger(JSON), error-handler, auth-guard, rate-limit
│   │   ├── modules/
│   │   │   ├── auth/       # auth.repo → auth.service → auth.route + password/session
│   │   │   ├── products/   # products.repo → products.service (cache TTL) → route
│   │   │   ├── cart/       # cart.repo → cart.service → cart.route
│   │   │   └── orders/     # orders.repo (checkout transacional) → service → route
│   │   ├── types/          # AppEnv + re-exports dos DTOs compartilhados
│   │   └── index.ts        # bootstrap (Hono + middlewares + rotas)
│   ├── Dockerfile
│   └── docker-compose.yml  # postgres:16-alpine (5433) + api (3001)
└── shared/
    └── dto.ts              # tipos compartilhados back ⇄ front (PublicUser, Product, Cart, Order)
```

Padrão por módulo: **route → service → repo**.
- **Route** só valida entrada (zod), chama o service e serializa.
- **Service** concentra as regras de negócio.
- **Repo** usa o Drizzle diretamente.

```
Request → request-id → logger → error-handler → cors/compress → route → service → repo → Postgres
```

## 3. Requisitos

- Node.js **22 LTS**.
- Docker com Compose (para o PostgreSQL 16). No macOS sem Docker Desktop,
  use **colima + docker CLI** via Homebrew:
  `brew install colima docker docker-compose && colima start`.

## 4. Como rodar (dev, local)

Todos os comandos abaixo rodam na pasta `backend/`. Alternativamente use o
`Makefile` na raiz (ver seção 7).

1. Suba o PostgreSQL (porta **5433** do host):
   ```
   docker compose up -d postgres
   ```

2. Configure o ambiente:
   ```
   cp .env.example .env
   ```

3. Instale as dependências:
   ```
   npm install
   ```

4. Aplique as migrações e o seed (6 produtos):
   ```
   npm run db:migrate
   npm run db:seed
   ```

5. Suba a API (porta 3001):
   ```
   npm run dev
   ```

A API fica em `http://localhost:3001` (health em `GET /health`).

## 5. Como testar

```
cd backend
npm run lint      # ESLint (erros zerados)
npm run build     # tsc (typecheck + emit para dist/)
npm test          # unit + integração (vitest) — precisa do Postgres rodando
```

- **Unit**: `password` (hash/verify, salt único), `session` (token, expiração),
  `rate-limit` (janela, bloqueio por IP).
- **Integração** (`tests/integration.test.ts`): usa um banco separado
  (`loja_test`, criado no setup) e cobre register→me→logout, login inválido,
  duplicado, CRUD de carrinho com limite de estoque, `POST /orders` transacional
  (decremento, carrinho limpo, rollback), e produtos só ativos.

> Se estiver rodando via Compose completo (api em container), suba primeiro:
> `docker compose up -d postgres` para liberar a porta 5433 aos testes.

### Fluxos manuais (curl)

```bash
# register
curl -s -c cookies.txt -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" -d '{"username":"teste","password":"segredo123"}'

# login
curl -s -c cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" -d '{"username":"teste","password":"segredo123"}'

# me (autenticado pelo cookie de cookies.txt)
curl -s -b cookies.txt http://localhost:3001/auth/me

# logout
curl -s -b cookies.txt -X POST http://localhost:3001/auth/logout
```

Exemplos de respostas esperadas na seção 6.

## 6. Exemplos de resposta

```
$ curl -s -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"errado","password":"x"}'
{"error":"invalid"}            # 401

$ curl -s -X POST http://localhost:3001/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"teste","password":"segredo123"}'
{"user":{"id":"<uuid>","username":"teste","createdAt":"2026-08-18T..."}}   # 201 + Set-Cookie

$ curl -s http://localhost:3001/products
{"products":[{"id":"<uuid>","name":"Camiseta Básica","priceCents":7990,...}, ...]}

$ curl -s -b cookies.txt -X POST http://localhost:3001/cart \
    -H "Content-Type: application/json" -d '{"productId":"<uuid>","qty":999}'
{"error":"stock"}              # 400

$ curl -s -b cookies.txt -X POST http://localhost:3001/orders
{"order":{"id":"<uuid>","status":"created","totalCents":39950,"items":[...]}}  # 201
```

## 7. Makefile (atalhos)

Na raiz do projeto:

```
make help        # lista todos os alvos
make install     # npm install no backend
make infra-up    # sobe o PostgreSQL (deps)
make infra-down  # derruba o PostgreSQL
make migrate     # aplica migrações
make seed        # popula os 6 produtos
make dev         # sobe a API em dev (requer Postgres de pé)
make api-up      # sobe stack completa (postgres + api) via Compose
make api-down    # derruba a stack completa
make lint        # eslint
make build       # tsc
make test        # vitest (unit + integração)
```

## 8. Ambientes / ports

| Recurso | Valor |
| ------- | ----- |
| API (host) | `http://localhost:3001` |
| Postgres (host) | `localhost:5433` |
| Navio/container DB | `postgres://loja:loja@localhost:5433/loja` |
| Banco de teste | `loja_test` (criado automaticamente no setup do vitest) |

## 9. Fora de escopo (Fase 1)

JWT, Redis, filas, paginação do catálogo, admin/CRUD de produtos, pagamentos,
e-mail, multi-instância com rate-limit compartilhado, APM/Sentry, UI de
cart/orders. A integração do frontend (login/register/logout + catálogo) é a
**Fase 2** — o backend já está pronto para ser consumido.