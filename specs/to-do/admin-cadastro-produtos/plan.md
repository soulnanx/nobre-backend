# Plano — Admin: cadastro de produtos (backend)

## Metadados

| Campo | Valor |
| --- | --- |
| Referência | [`spec.md`](./spec.md) |
| Status | `aprovada` |
| Versão | 0.1.0 |
| Data | 2026-08-19 |

## Decisões técnicas

| # | Decisão | Justificativa |
| --- | --- | --- |
| AD-01 | Coluna `role` em `users`: `text("role").notNull().default("customer")`. | RF-01; default no banco garante que registros existentes e novos nascem `customer`. |
| AD-02 | `PublicUser` em `shared/dto.ts` ganha `role: "admin" \| "customer"`. | RF-02; `backend/src/types/dto.ts` re-exporta de `shared/dto.ts` (fonte da verdade). |
| AD-03 | `toPublicUser` (auth.service) passa a incluir `role`. | RF-03; login/register/me usam a mesma função. |
| AD-04 | Novo middleware `adminGuard` em `src/middleware/admin-guard.ts`, composto após `authGuard` (`authGuard, adminGuard`). | RF-04/RF-05; `authGuard` já valida sessão e seta `userId`; `adminGuard` busca o usuário e checa `role === "admin"`, retornando `403 { error: "forbidden" }`. |
| AD-05 | `POST /products` em `products.route.ts` com zod (`createProductSchema`). | RF-04/RF-07; padrão route→service→repo da constitution §1. |
| AD-06 | `createProduct` no service + `create` no repo; `clearCache()` chamado após criar. | RF-08; o service já expõe `clearCache()` e o cache tem TTL de 60s. |
| AD-07 | Script `db:promote-admin <username>` em `src/db/promote-admin.ts` + script npm. | RF-09; sem UI (DD-03). |
| AD-08 | Migração via `drizzle-kit generate` (SQL versionado em `src/db/migrations/`). | Constitution §3: migrações são commitadas. |
| AD-09 | Sem dependências novas. | Constitution §4. |

## Contratos de dados / API

### Schema (migração)

| Tabela | Mudança |
| --- | --- |
| `users` | Nova coluna `role` (`text`, `notNull`, default `"customer"`). |

### DTO (`shared/dto.ts`)

```ts
export type PublicUser = {
  id: string;
  username: string;
  role: "admin" | "customer";
  createdAt: string;
};
```

### Endpoints

| Método | Caminho | Auth | Entrada | Saída (JSON) | Erros |
| --- | --- | --- | --- | --- | --- |
| POST | `/products` | cookie `session` + role admin | `{ name, description, priceCents, color, stockQty }` | `201 { product: Product }` | `401 {error:"unauthorized"}` · `403 {error:"forbidden"}` · `400 {error:"validation"}` |

`Product` (já existente em `shared/dto.ts`): `{ id, name, description, priceCents, color, stockQty, active, createdAt }`.

### Validação do corpo (`createProductSchema`)

- `name`: `z.string().trim().min(1).max(200)`
- `description`: `z.string().trim().min(1).max(2000)`
- `priceCents`: `z.number().int().positive()`
- `color`: `z.string().trim().min(1).max(100)`
- `stockQty`: `z.number().int().min(0)`

## Módulos / arquivos afetados

| Arquivo | Mudança |
| --- | --- |
| `shared/dto.ts` | `PublicUser` + `role`. |
| `backend/src/db/schema.ts` | `users` + coluna `role`. |
| `backend/src/db/migrations/` | Nova migração gerada por `drizzle-kit generate`. |
| `backend/src/middleware/admin-guard.ts` | Novo middleware `adminGuard`. |
| `backend/src/modules/auth/auth.service.ts` | `toPublicUser` inclui `role`. |
| `backend/src/modules/products/products.route.ts` | `POST /` com `authGuard, adminGuard` + zod. |
| `backend/src/modules/products/products.service.ts` | `createProduct(input)` + `clearCache()`. |
| `backend/src/modules/products/products.repo.ts` | `create(input)`. |
| `backend/src/db/promote-admin.ts` | Novo script `db:promote-admin <username>`. |
| `backend/package.json` | Script `db:promote-admin`. |
| `backend/tests/integration.test.ts` | Cenários de `POST /products` (admin, não-admin, anônimo, validação). |

## Fluxos

**Criar produto (admin):** `POST /products` → `authGuard` valida sessão (401 se
sem/ inválida) → `adminGuard` busca usuário e checa `role` (403 se não-admin) →
route valida corpo com zod (400 se inválido) → `service.createProduct` insere no
banco e chama `clearCache()` → `201 { product }`.

**Promover a admin:** `npm run db:promote-admin -- <username>` → atualiza
`users.role = "admin"` para o username informado → loga o resultado.

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Migração quebra registros existentes | Coluna com default `"customer"`; `ALTER TABLE` aditivo. |
| Cache serve produto antigo após criar | `clearCache()` chamado no `createProduct` (RF-08). |
| `adminGuard` duplica lógica de sessão | Composto após `authGuard`; reusa `userId` do contexto. |
| Frontend ainda em mock | Contrato fechado com o frontend; trocar `MOCK_API=1` por chamada real é só remover a flag. |

## Fora de escopo

- Edição, exclusão, ativar/desativar produto e estoque (specs futuras).
- UI de promoção de usuário a admin.
- Mudanças no repo `loja/`.