# Constitution — princípios imutáveis do be-loja

Regras que **não são negociáveis** e valem para toda spec, plano e código gerado.
Mudar este arquivo é uma decisão explícita de todo o time, não um ajuste de
feature.

Documentos históricos que continuam válidos como **registro de decisão de
feature** já entregue: `SPEC.md` (backend Fase 1) e `SPEC-INTEGRACAO-FRONTEND.md`
(Fase 2 / integração com o frontend `loja/`). Para novas features, prevalece o
fluxo definido em `specs/README.md`.

## 1. Stack e arquitetura

- **Runtime**: Node.js **22 LTS** + **TypeScript 5 strict** (`verbatimModuleSyntax`
  on).
- **Framework HTTP**: **Hono** com adaptador `@hono/node-server`. Middlewares
  globais (`request-id`, `logger`, `error-handler`, `cors`, `compress`) ficam
  em `src/middleware/` e são carregados no bootstrap (`src/index.ts`).
- **Banco**: **PostgreSQL 16** acessado via **Drizzle ORM** (`pg`/Pool). Schema
  em `src/db/schema.ts`; migrações geradas por `drizzle-kit` em
  `src/db/migrations/` ficam **versionadas no repo**.
- **Validação**: **zod** para env (`src/config/`) e DTOs de entrada nas rotas.
  Boot falha rápido se env inválido.
- **Testes**: **vitest** (unit + integração). Integração usa banco separado
  `loja_test`, criado no setup.
- **Padrão por módulo**: `route → service → repo`. Route valida entrada (zod),
  chama o service e serializa. Service concentra as regras de negócio. Repo usa
  Drizzle diretamente.

## 2. Tipos e contratos

- Tipos compartilhados (DTOs públicos) vivem em `shared/dto.ts` na **raiz do
  repositório** — é a **única fonte da verdade** dos contratos `back ⇄ front`.
  Frontend (`loja/`) importa via caminho relativo ou mantém cópia manual
  sincronizada (ver constitution do frontend).
- Novos DTOs (`User`, `Product`, `Cart`, `Order`, derivados) **sempre** entram em
  `shared/dto.ts` antes de serem usados por route/service.
- Valores monetários são **inteiros em centavos** (`priceCents`,
  `totalCents`, `unitPriceCents`). Nunca usar `float` para dinheiro.
- IDs, status e códigos de erro são **opacos** para o cliente: erros sempre no
  formato `{ "error": "<código>" }` com status HTTP correto (ver
  `error-handler`).
- Nomes de erros são estáveis e versionados; qualquer mudança quebra contrato
  com o frontend e exige migração coordenada.

## 3. Qualidade e verificação

- Toda entrega passa por `make lint`, `make build` e `make test` (este último
  com Postgres de pé — `make infra-up` antes se preciso). CI não é
  configurável para falhar com testes pulados.
- Cobertura mínima por feature: **unit** para regras puras (hash/senha,
  sessão, rate-limit, validações de stock/empty-cart) e **integração** para o
  caminho feliz + ao menos um erro documentado na spec.
- Migrações de banco são **commitar** (`drizzle-kit generate` + commit do SQL
  gerado). Aplicar via `make migrate` no dev; documentar passos manuais na
  spec quando houver.
- Sem mudanças em `data/users.json` (legado) — prova de que o backend substituiu
  a persistência em arquivo.
- Logs JSON estruturados com `request-id` em todas as requisições; nenhum
  `console.log` solto no código de produção.

## 4. Processo

- **Spec-anchored**: mudança de comportamento começa na spec
  (`specs/<feature>/`), nunca no código. Ver `specs/README.md`.
- Toda feature trabalha no branch `feature/<nome>` do repositório atual (sem
  worktrees); o status é espelhado no metadado da spec e na posição da pasta
  (`to-do/` → `wip/` → `done/`).
- Commits: `git add` apenas dos arquivos da feature (nunca `git add -A`);
  mensagens descritivas em português, idealmente referenciando o `RF-0x`
  atendido.
- **Sem novas dependências** sem justificativa registrada no `plan.md` (qual
  problema resolve, por que alternativas nativas/std foram descartadas).
- Não editar arquivos do repositório vizinho `loja/` (frontend tem repo
  próprio). Troca de contrato = nova spec coordenada com o frontend.

## 5. Idioma e UX

- Logs, mensagens de erro e documentação do projeto em **português (pt-BR)**.
- Mensagens de erro amigáveis, consistentes e com **código de erro rastreável**
  (`{ error: "stock" }`, `{ error: "empty-cart" }`, etc.). O frontend é
  responsável por mapear o código para texto ao usuário; o backend nunca devolve
  mensagem pronta para o usuário final.
- Formato de resposta: `2xx` JSON no envelope `{ recurso: T }` ou coleções
  `{ recursos: T[] }`. Erros sempre `{ error: string }`.

## 6. Fora de escopo (V1, já decidido)

Estes itens foram conscientemente excluídos do V1 e exigem nova spec
(`specs/to-do/<feature>/`) antes de qualquer implementação:

- JWT, Redis, filas/workers.
- Paginação do catálogo.
- Admin/CRUD de produtos (UI separada).
- Pagamentos, e-mail.
- Multi-instância com rate-limit compartilhado.
- APM/Sentry.
- UI de cart/orders (fica no frontend).
