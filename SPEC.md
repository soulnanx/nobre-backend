# SPEC — Backend da Loja

> Status: **aprovada para implementação**
> Stack aprovada: **Node.js + TypeScript + Hono + PostgreSQL/Drizzle**
> Deploy inicial: Docker/VPS (serverless = rota futura, Hono já suporta sem reescrita)

---

## 1. Objetivo

Criar um backend HTTP independente para a Loja, consumido pelo frontend Next.js
já existente. Troca a persistência atual (`data/users.json` + products hardcoded
no `/home`) por uma API tipada sobre PostgreSQL, com performance como requisito.

**Escopo Fase 1 (backend):** API REST completa (auth, products, cart, orders) +
banco + migrations + seed + testes + Docker compose.

**Escopo Fase 2 (integração frontend):** o Next.js passa a consumir a API em
`auth` (login/register/logout) e `products` (catálogo). Cart e orders ficam
prontos na API, mas **não** ganham UI agora (não existe UI de carrinho/pedido no
frontend hoje).

## 2. Stack e versões

| Item            | Escolha                                        | Nota                                   |
| --------------- | ---------------------------------------------- | -------------------------------------- |
| Runtime         | Node.js 22 LTS                                 | LTS atual                              |
| Linguagem       | TypeScript 5 strict                            | `verbatimModuleSyntax` on              |
| Framework HTTP  | Hono                                           | Web-standard `Request`/`Response`      |
| Banco           | PostgreSQL 16                                  | Relacional, transações p/ pedidos      |
| ORM             | Drizzle ORM + drizzle-kit                      | SQL-first, leve, migrações versionadas |
| Validação       | zod (env + DTOs de entrada)                    |                                        |
| Testes          | vitest                                         | Unit + integração (Postgres real)      |
| Monitoramento   | logs estruturados JSON + request-id            | Sem Sentry/APM no V1                   |
| Infra/dev       | Docker Compose (postgres + api)                |                                        |

## 3. Estrutura de repositório

```
loja/
  SPEC.md
  backend/
    package.json
    tsconfig.json
    drizzle.config.ts
    .env.example
    docker-compose.yml            # postgres + api (dev)
    Dockerfile
    src/
      config/index.ts             # env validado via zod
      db/schema.ts                # tabelas
      db/migrations/              # geradas por drizzle-kit (commitar)
      db/seed.ts                  # seed dos 6 produtos atuais
      modules/
        auth/
          auth.route.ts
          auth.service.ts
          auth.repo.ts
          session.ts              # criação/validação de sessões (token)
          password.ts             # hash/verify scrypt async
        products/
          products.route.ts
          products.service.ts
          products.repo.ts
        cart/
          cart.route.ts
          cart.service.ts
          cart.repo.ts
        orders/
          orders.route.ts
          orders.service.ts
          orders.repo.ts
      middleware/
        auth-guard.ts             # protege rotas privadas
        rate-limit.ts             # in-memory sliding window (auth)
        error-handler.ts          # padroniza { error }
        request-id.ts
        logger.ts                 # logs JSON
      types/dto.ts
      index.ts                    # bootstrap do servidor
  shared/
    dto.ts                        # tipos compartilhados back <-> front
```

Padrão por módulo (mantido simples, sem over-engineering): `route → service →
repo`. Repo usa Drizzle diretamente. Service concentra regras. Route só valida
entrada (zod), chama service e serializa.

### Tipos compartilhados

Os DTOs públicos (User, Product, CartItem, Order) vivem em `shared/dto.ts` na
raiz do monorepo. Front adiciona alias `@shared/* → ../shared/*` no seu
`tsconfig.json`; backend importa via caminho relativo. Nenhum pacote npm
monorepo — só uma pasta de tipos. Se virar dor de cabeça, move para um
`packages/shared` com workspace real (decisão futura).

## 4. Domínio (schema)

```ts
users      { id: uuid pk, username: text unique, passwordHash: text,
             createdAt: timestamptz default now }
sessions   { id: uuid pk, userId: fk->users, token: text unique,
             expiresAt: timestamptz, createdAt: timestamptz default now }
products   { id: uuid pk, name: text, description: text,
             priceCents: int (não usar float para dinheiro),
             color: text (classes tailwind do gradiente da UI atual),
             stockQty: int default 0, active: boolean default true,
             createdAt: timestamptz }
cart_items { id: uuid pk, userId: fk->users, productId: fk->products,
             qty: int > 0, createdAt: timestamptz,
             unique(userId, productId) }
orders     { id: uuid pk, userId: fk->users, status: text ('created'),
             totalCents: int, createdAt: timestamptz }
order_items{ id: uuid pk, orderId: fk->orders, productId: fk->products,
             name: text, unitPriceCents: int, qty: int } // snapshot
```

- Preços em **centavos (int)**. Formatação (ex.: `R$ 79,90`) fica no front.
- `order_items` guarda snapshot (name/price), pois produto pode mudar depois.
- Migrações commitar. Seed: os 6 produtos atuais do `/home` (preços em centavos:
  7990, 24990, 18990, 5990, 13990, 32990).
- Índices: `users.username unique`, `sessions.token unique`, `sessions.userId`,
  `cart_items(userId, productId) unique`, `orders.userId`.

## 5. API (REST)

Formato de erro sempre: `{ "error": "mensagem legível" }` com status correto.

### Auth
| Método | Rota             | Auth | Descrição                                        |
| ------ | ---------------- | ---- | ------------------------------------------------ |
| POST   | `/auth/register` | –    | cria usuário, inicia sessão, `201 {user}` + cookie|
| POST   | `/auth/login`    | –    | `200 {user}` + cookie                            |
| POST   | `/auth/logout`   | sim  | invalida sessão, `204`, limpa cookie             |
| GET    | `/auth/me`       | sim  | `200 {user}` / `401`                             |

- `register`: username trim, min 3 / max 254; password min 4 / max 128 (paridade
  com o front atual). Username duplicado → `409 { error: "exists" }`.
- `login`: falha → `401 { error: "invalid" }`.

### Products (públicos)
| Método | Rota             | Descrição                          |
| ------ | ---------------- | ---------------------------------- |
| GET    | `/products`      | lista `active=true`, ordenado criado |
| GET    | `/products/:id`  | `200 {product}` / `404`            |

### Cart (auth)
| Método | Rota                      | Descrição                                  |
| ------ | ------------------------- | ------------------------------------------ |
| GET    | `/cart`                   | itens com produto preenchido + totalCents  |
| POST   | `/cart`                   | `{ productId, qty }` valida estoque        |
| PATCH  | `/cart/:productId`        | `{ qty }` (mín 1)                          |
| DELETE | `/cart/:productId`        | remove item                                |
| DELETE | `/cart`                   | limpa carrinho                             |

POST quando item já existe → incrementa qty (não duplica). Quantidade não pode
exceder `stockQty` → `400 { error: "stock" }`.

### Orders (auth)
| Método | Rota          | Descrição                                            |
| ------ | ------------- | ---------------------------------------------------- |
| POST   | `/orders`     | cria pedido a partir do carrinho do usuário           |
| GET    | `/orders`     | lista pedidos do usuário (com itens)                 |
| GET    | `/orders/:id` | detalhe (404 se não for dono)                        |

`POST /orders` é **transacional**: valida estoque de todos os itens no momento
da criação, decrementa `stockQty`, cria `order` + `order_items`, e limpa o
carrinho. Estoque insuficiente → rollback total + `400 { error: "stock" }`.
Carrinho vazio → `400 { error: "empty-cart" }`.

## 6. Auth e segurança

- **Hash de senha:** `scrypt` **assíncrono** (`scrypt` de `node:crypto`
  promisificado) — o `scryptSync` atual do `lib/auth.ts` bloqueia o event loop,
  é justamente o que queremos evitar. Formato `salt:hash` compatível com o atual
  (salt 16 bytes hex, keylen 64). `timingSafeEqual` na verificação.
- **Sessão:** token opaco `randomBytes(32).hex` armazenado na tabela `sessions`
  (revogável por logout). Cookie `session`, `httpOnly`, `sameSite=lax`,
  `path=/`, `maxAge` = `SESSION_TTL` (padrão 24h). Guard middleware valida o
  token no banco + `expiresAt`.
- **Rate limit:** in-memory sliding window em `/auth/register` (5/min/IP) e
  `/auth/login` (10/min/IP). No V1 single-instance basta; em multi-instância
  migrar para Redis (fora de escopo).
- **CORS:** `@hono/cors` com allowlist por env (`CORS_ORIGINS`). Hoje o front
  chama a API server-side (sem CORS), mas deixar habilitado não custa nada.

## 7. Performance

- `pg` **Pool** com tamanho por env (`POOL_SIZE`, default 10).
- Prepared statements (Drizzle usa por padrão).
- Cache do catálogo: **in-memory com TTL** (60s) em `GET /products` (e
  `/products/:id`). Sob escrita (admin futuro) o cache local pode incomodar —
  V1 aceito (loja pequena, escrita rara). Troca para Redis documentada, não feita.
- Compressão gzip nas respostas (`@hono/node-server/compress`).
- Logs JSON estruturados via middleware próprio + `request-id` (rastreabilidade).
- **Metas locais (bench não bloqueante):** catálogo cacheado p50 < 5ms / p95
  < 20ms; `login`/`register` p95 < 300ms (domínio do scrypt). Script opcional de
  benchmark com `autocannon` em `backend/scripts/bench.mjs`.

## 8. Configuração (env)

`.env.example` com:
```
PORT=3001                  # dev: checar porta livre com `lsof -i :3001`
DATABASE_URL=postgres://loja:loja@localhost:5433/loja
POOL_SIZE=10
SESSION_TTL=86400          # segundos
RATE_LIMIT_REGISTER=5
RATE_LIMIT_LOGIN=10
CORS_ORIGINS=http://localhost:3000
```

Tudo validado no boot (zod) — falha rápida se faltar/config inválida.

## 9. Docker / dev

- `backend/docker-compose.yml`: serviço `postgres` (imagem `postgres:16-alpine`,
  **porta 5433** no host p/ não colidir com Postgres local) + serviço `api`
  (build do `Dockerfile`, depende do postgres, roda `db:migrate` + `db:seed` no
  entrypoint). Front roda local (`npm run dev`).
- Scripts npm: `dev`, `build`, `start`, `test`, `lint`, `db:migrate`, `db:seed`,
  `db:generate`.
- Portas: antes de subir, conferir `lsof -i :3001` / `:5433`.

## 10. Testes

- **Unit (vitest):** `password` (hash/verify, salt único), `session` (criação,
  expiração), `rate-limit` (janela, eviction).
- **Integração:** API real + Postgres de teste (banco separado, criado no setup).
  Fluxos: register→me→logout; login inválido; duplicado; CRUD cart com limite de
  estoque; `POST /orders` transacional (estoque decrementado, carrinho limpo,
  rollback com estoque insuficiente); produtos só ativos.
- Rodar com `npm test`. Docker compose do dev serve de infra p/ integração.

## 11. Integração frontend (Fase 2 — mesmo PR)

1. `lib/auth.ts` corrente é **removido**; cria `lib/api-client.ts` (fetch wrapper
   tipado, baseURL de `API_URL` server-side / `NEXT_PUBLIC_API_URL`).
2. `app/actions.ts`: `loginAction`/`registerAction`/`logoutAction` chamam a API
   (POST register/login/logout) e repicam a sessão: setam/limpam o cookie igual
   ao servidor manda (o backend também envia `Set-Cookie`; no server-action
   repicar manualmente é mais simples).
3. `app/page.tsx` mantém os `error` codes (`empty`, `invalid`, `exists`,
   `short-password`) — traduzir o `{ error }` da API p/ esses codes.
4. `app/home/page.tsx`: products deixam de ser hardcoded e são buscados via
   `GET /products` (server component, fetch server-side). Manter formatação
   `R$ xx,xx` a partir de `priceCents` (helper em `lib/format.ts`).
5. `PublicUser`/`Product` tipos importados de `shared/dto.ts`.
6. Env: `.env.example` do front com `API_URL=http://localhost:3001`.

## 12. Fora de escopo (V1 não faz)

JWT, Redis, filas/workers, paginação do catálogo, admin/CRUD de produtos,
pagamentos, e-mail, multi-instância com rate-limit compartilhado, APM/Sentry,
UI de cart/orders.

## 13. Definição de pronto (Acceptance)

- [ ] `docker compose up` sobe postgres + api; migrations + seed aplicam.
- [ ] `npm run lint` e `npm test` verdes no `backend/`.
- [ ] Fluxos validados por curl: register, login, me, logout, produtos, cart,
      checkout com decremento/rollback de estoque.
- [ ] Front (Fase 2): login/register/logout funcionando contra a API e o catálogo
      renderiza a partir de `GET /products`.
- [ ] Evidência visual (AGENTS.md): screenshots em `artifacts/backend/` do login
      e home com produtos vindos da API; `.agent-context` com STATUS/PROGRESSO/
      EVIDENCIA atualizados.
- [ ] Nenhuma alteração em `data/users.json` após o primeiro login via API
      (prova de que o backend substituiu a persistência em arquivo).

## 14. Notas de implementação

- Não adicionar dependência além das listadas sem justificar na SPEC.
- Namings/convenções padrão do repo (sem comentários supérfluos no código).
- Respeitar AGENTS.md: worktree próprio (`feature/backend`), portas livres,
  commits só da feature, `.agent-context` atualizado a cada etapa.