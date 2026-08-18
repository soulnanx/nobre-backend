# SPEC — Fase 2: Integrar o Frontend (Next.js) à API Backend

> Status: **pronto para execução por outro assistente**
> Escopo: conectar o frontend `loja/` à API do backend `be-loja/`
> Autor: sessão orquestradora (backend entregue e mergeado em `main`)

---

## 0. Leia isto primeiro (contexto completo — não pergunte ao autor)

Este documento é **autossuficiente**. Todo o contexto que faltou na instrução
original está aqui embaixo: onde estão as pastas, como subir o backend, como
testar, o que mudar no frontend e como gerar a evidência.

**Os dois repositórios são SEPARADOS** (cada um tem seu `.git`), lado a lado:

```
~/Developer/workspace/tests/
├── be-loja/        # BACKEND (repo próprio, já 100% pronto e mergeado em main)
│   ├── README.md        ← LEIA ANTES: arquitetura, como rodar, como testar
│   ├── Makefile         ← LEIA ANTES: atalhos (infra, migrate, seed, dev, test)
│   ├── SPEC.md          ← spec original do backend
│   ├── shared/dto.ts    ← tipos compartilhados (fonte da verdade)
│   └── backend/         # código do servidor (Hono + Postgres)
└── loja/           # FRONTEND (repo próprio, Next.js 16, SEU ALVO DE TRABALHO)
    └── app/, lib/, data/ ...
```

Se você não sabe como subir/testar o backend, **leia `be-loja/README.md`** e o
`be-loja/Makefile` — eles foram criados exatamente para isso.

---

## 1. Estado atual (o que já existe)

### Backend (`be-loja/`) — pronto, não precisa mexer
API em **Hono** na porta **3001**, sobre **PostgreSQL 16** (porta host **5433**).
Endpoints:
| Método | Rota | Auth | Resposta OK | Erros |
| ------ | ---- | ---- | ----------- | ----- |
| POST | `/auth/register` | – | `201 {user}` + cookie `session` | `409 {error:"exists"}` · `400 {error:"invalid-credentials"}` |
| POST | `/auth/login` | – | `200 {user}` + cookie `session` | `401 {error:"invalid"}` |
| POST | `/auth/logout` | cookie | `204` (limpa cookie) | `401 {error:"unauthorized"}` |
| GET | `/auth/me` | cookie | `200 {user}` | `401 {error:"unauthorized"}` |
| GET | `/products` | – | `200 {products:[Product]}` | – |
| GET | `/products/:id` | – | `200 {product}` | `404 {error:"not-found"}` |
| (cart/orders prontos, sem UI nesta fase) | | | | |

**Formato de erro sempre:** `{ "error": "<código>" }` com status HTTP correto.

**DTOs** (em `be-loja/shared/dto.ts`, fonte da verdade):

```ts
PublicUser = { id: string; username: string; createdAt: string }
Product    = { id, name, description, priceCents: number, color: string,  // color = classes tailwind do gradiente
               stockQty: number, active: boolean, createdAt: string }
```

Preços em **centavos (int)** — o front deve formatar `R$ xx,xx` (helper novo em
`lib/format.ts`).

**Cookie de sessão:** nome `session`, `httpOnly`, `sameSite=lax`, `path=/`,
`maxAge` 24h, valor = token opaco. O front só precisa re-enviar/limpar o cookie.

### Frontend (`loja/`) — hoje NÃO usa a API
- `lib/auth.ts` — autenticação em **arquivo JSON** (`data/users.json`) com
  `scryptSync`. Será **removido** (está na seção 3).
- `app/actions.ts` — server actions `loginAction`, `registerAction`,
  `logoutAction` usando `lib/auth.ts`.
- `app/page.tsx` — tela de login; usa `error` codes `empty | invalid | exists |
  short-password`.
- `app/home/page.tsx` — produtos **hardcoded** em array local (6 itens).
- `app/login-form.tsx` — formulário client (não muda).
- `data/users.json` — persistência antiga (não deve mais ser escrita).

**Paridade das senhas/junção:** o backend usa `scrypt` async com o MESMO
formato `salt:hash` do `lib/auth.ts` atual, então usuários antigos do
`users.json` têm hash compatível — mas a Fase 2 não exige migrá-los; basta a
prova de que o arquivo para de ser usado.

---

## 2. Como subir e testar o backend (antes de mexer no front)

Leia o `README.md` do backend, mas o caminho rápido é via `make`:

```bash
cd ~/Developer/workspace/tests/be-loja
make install       # npm install no backend
make infra-up      # sobe o PostgreSQL (porta 5433)
make migrate       # aplica as migrações
make seed          # popula os 6 produtos
make dev           # sobe a API em http://localhost:3001 (manter rodando)
make test          # 20/20 testes (unit+integração)
make lint          # eslint limpo
make build         # tsc ok
```

Smoke test da API (num 2º terminal):
```bash
# saúde
curl -s http://localhost:3001/health            # {"status":"ok"}

# register (cria e já loga)
curl -s -c /tmp/ck.txt -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"segredo123"}'

# me (usa o cookie salvo)
curl -s -b /tmp/ck.txt http://localhost:3001/auth/me

# catálogo
curl -s http://localhost:3001/products
```

> **Portas da API:** confira com `lsof -i :3001` e `lsof -i :5433` antes de
> subir. Se já houver processo, use outra porta e ajuste `API_URL` no front.

---

## 3. Mudanças no frontend (`loja/`)

Segue rigorosamente a SPEC original `be-loja/SPEC.md` §11. Onde houver dúvida,
prevalece aquela especificação + este documento.

### 3.1. Cliente HTTP tipado — `lib/api-client.ts` (novo)
- `fetch` wrapper para o backend, com `baseURL` vinda de:
  - `process.env.API_URL` (server-side) ou `process.env.NEXT_PUBLIC_API_URL`;
  - **fallback default** `http://localhost:3001`.
- Funções tipadas: `registerUser`, `loginUser`, `logoutUser`, `getMe`,
  `listProducts`, `getProduct`.
- Repassar cookies: nas server actions, envie `cookie: <cookie atual>` no header
  (o backend lê o cookie `session`). Respostas de register/login trazem
  `Set-Cookie`; repique o valor manualmente nos cookies do Next (ver 3.2).
- Tratar corpo `{ error }` e lançar/retornar de forma mapeável (ver 3.3).

### 3.2. `app/actions.ts` — chamar a API
- **Remover** import de `@/lib/auth`; usar `lib/api-client` + `lib/format` se preciso.
- `loginAction(formData)`:
  1. extrai/trim `username`, `password`;
  2. valida vazio → `redirect("/?error=empty")`;
  3. chama `POST /auth/login`;
  4. `401 {error:"invalid"}` → `redirect("/?error=invalid")`;
  5. sucesso → seta cookie `session` (httpOnly, sameSite lax, path /, maxAge
     24h) igual ao do backend e `redirect("/home")`.
- `registerAction(formData)`:
  1. valida vazio → `?error=empty`;
  2. `password.length < 4` → `?error=short-password`;
  3. `POST /auth/register`;
  4. `409 {error:"exists"}` → `?error=exists`;
  5. sucesso → seta cookie e `redirect("/home")`.
- `logoutAction()`: chama `POST /auth/logout` com o cookie atual, limpa o
  cookie `session` e `redirect("/")`.

### 3.3. `app/page.tsx` — manter os mesmos `error` codes
Manter o mapa `errorMessages` (`empty`, `invalid`, `exists`, `short-password`).
Se vier outro código da API, manter fallback "Algo deu errado...".
Trocar o texto "dados armazenados em memória" se fizer sentido após a mudança
(opcional).

### 3.4. `app/home/page.tsx` — catálogo real da API
- Remover o array `products` hardcoded.
- No server component (com `await cookies()` p/ sessão, igual hoje), buscar
  `GET /products` — **fetch server-side** com `cache: "no-store"` ou `revalidate`
  adequado (catálogo fresco).
- Mapear `priceCents → "R$ xx,xx"` via helper em `lib/format.ts`:
  ```ts
  export function formatReais(cents: number): string {
    return cents.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  ```
- Usar `product.color` (já é as classes do gradiente) e `product.name`. Manter
  o visual atual (grid, card, cores).
- Continuar protegendo a rota: sem cookie/sessão → `redirect("/")`. Definir o
  que usar como "sessão": com `getMe` no backend, ou manter a estratégia
  (recomendado: validar via `GET /auth/me` no server component usando o cookie).

### 3.5. Tipos compartilhados
`loja/` é um repo separado de `be-loja/`, então **não** usar alias
`@shared/* → ../shared/*` apontando para fora do projeto (fragile + quebra no
build de alguns ambientes). Opções, escolha uma e documente no `.agent-context`:

- **(A — recomendada) Copiar** os tipos para `lib/types.ts` (ou `types/`),
  com comentário apontando a fonte: `be-loja/shared/dto.ts`; manter sync manual.
- **(B)** Alias `@shared/*` no `tsconfig.json` apontando para
  `../be-loja/shared/*` — funciona localmente, mas **quebra o build/deploy**
  do Next se o CI não enxergar a pasta vizinha.

### 3.6. Env do frontend
- Criar `.env.local` (ou `.env`) com:
  ```
  API_URL=http://localhost:3001
  NEXT_PUBLIC_API_URL=http://localhost:3001   # apenas se preciso no client
  ```
- Atualizar/adicionar `.env.example` correspondente no front (sem segredos).

### 3.7. Remover `lib/auth.ts`
Após as server actions deixarem de usar, **remover** `lib/auth.ts`. Manter
`data/users.json` (a prova do critério 5.4 é que **não seja mais alterado**).

> Cuidado: leia `loja/AGENTS.md` — este Next.js 16 tem detalhes/breaking
> changes; verifique docs locais em `loja/node_modules/next/dist/docs/` antes
> de codar server components/actions.

---

## 4. Como testar a integração

1. Backend de pé (`make dev` em `be-loja`) + `lsof -i :3001` sem peer conflito.
2. Front `cd loja && npm run dev` (porta **3000**).
3. Fluxos manuais (validação funcional):
   - **Register**: preencher form → "/home" com produtos oriundos da API.
   - **Register duplicado** → mostra "Este login já está cadastrado."
   - **Senha curta** → "A senha deve ter pelo menos 4 caracteres."
   - **Login inválido** → "Login ou senha incorretos."
   - **Logout** → volta para "/" e cookie limpo.
   - **Catálogo**: confere que os 6 produtos vêm com `priceCents` e grade correta.
   - **Prova de troca de persistência**: após manipular fluxos, conferir que
     `data/users.json` **não mudou** (mtime/conteúdo).
4. Build/lint do front: `cd loja && npm run lint && npm run build`.
5. Backend intocado: `cd be-loja && make lint && make test` continuam verdes.

> Não há UI de cart/orders hoje; não criar UI nova. Validar cart/orders só por
> curl (opcional), para não mudar escopo.

---

## 5. Definição de pronto (Acceptance)

- [ ] Login/register/logout funcionando contra a API (cookie `session` correto).
- [ ] Home renderiza catálogo vindo de `GET /products`.
- [ ] Tratamento de erros com os codes `empty | invalid | exists | short-password`.
- [ ] `lib/auth.ts` removido; `lib/api-client.ts` + `lib/format.ts` presentes.
- [ ] `data/users.json` **inalterado** após uso da tela (prova de troca de persistência).
- [ ] Front: `npm run lint` e `npm run build` limpos.
- [ ] Backend: `make lint` e `make test` continuam 20/20.
- [ ] **Evidência visual**: subir front (porta livre) e gerar screenshots com
      Playwright (Chrome do sistema) em `loja/artifacts/<feature>/`:
      - login, registro, home com produtos da API.
      - fluxo de erro (ex.: login inválido).
- [ ] `.agent-context` do front atualizado com `STATUS/PROGRESSO/EVIDENCIA`.

---

## 6. Regras de trabalho (AGENTS.md) — leia e siga

- Não execute `git add -A`. Commite só arquivos da feature.
- Faça commits no seu branch (`feature/...` customizado) e ao terminar,
  atualize `.agent-context` com `STATUS=feito` + resumo final.
- Confira portas livres (`lsof -i :3000/:3001/:5433`) antes de subir servidores.
- Não altere `package.json`/`node_modules` do projeto para screenshots
  (Playwright via /tmp, `channel: "chrome"`).
- Não edite arquivos do repo `be-loja` (backend já pronto) — leitura/invocação
  apenas, via `make`/curl.
- Seguir namings/convenções do repo, sem comentários supérfluos.

---

## 7. Checklist de contexto que o autor ESQUECEU de passar (e está aqui)

- [x] Caminho do README do backend (`be-loja/README.md`) — arquitetura e testes.
- [x] Caminho do Makefile (`be-loja/Makefile`) — como subir/migrar/seed/testar.
- [x] Como subir a API (passo a passo, seção 2) e como smoke-testar.
- [x] Portas: API 3001, Postgres 5433, front 3000.
- [x] Endpoints/erros/DTOs exatos (seções 1–2).
- [x] O que muda em cada arquivo do front (seção 3).
- [x] Como gerar evidência visual (seção 5).
- [x] Regras de trabalho e proteções (seção 6).