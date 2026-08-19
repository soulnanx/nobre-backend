# Specs — Spec-Driven Development no be-loja

Este diretório centraliza as especificações do backend da Loja. Elas seguem a
metodologia **Spec-Driven Development (SDD)** na variante **spec-anchored**: a
spec é viva, versionada junto com o código e é a fonte de verdade sobre **o que**
e **por que** algo existe. Mudanças de comportamento começam pela spec, nunca
pelo código.

## Como o processo funciona

Cada feature (ou correção com impacto de comportamento) passa por 4 artefatos,
nesta ordem:

```
constitution → spec → plan → tasks → implementação → validação
```

| Artefato | Arquivo | Responde a | Quem escreve |
| --- | --- | --- | --- |
| Constituição | `constitution.md` | Quais são as regras imutáveis do projeto? | Uma vez, no início |
| Spec | `<feature>/spec.md` | O **quê** e o **porquê** | Humano + agente |
| Plano | `<feature>/plan.md` | O **como** (técnico) | Agente (humano revisa) |
| Tasks | `<feature>/tasks.md` | Em quais passos atômicos dividir? | Agente (humano revisa) |

A `constitution.md` deste projeto é a **nova fonte de verdade sobre regras
imutáveis**. Os documentos históricos `SPEC.md` (backend Fase 1) e
`SPEC-INTEGRACAO-FRONTEND.md` (Fase 2) continuam valendo como **registro de
decisão de feature** já entregue — features novas devem usar o fluxo descrito
neste `README.md` e na `constitution.md`.

## Estrutura de pastas

A pasta onde a feature mora **representa o seu status**. A pasta de uma feature só
muda de lugar na transição de status — nunca por causa de conteúdo.

```
specs/
├── README.md          # este manual
├── constitution.md    # princípios imutáveis
├── to-do/             # definida, mas ainda NÃO vai executar (fila de intenção)
│   └── <feature>/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
├── wip/               # em implementação (branch feature/<nome>)
│   └── <feature>/...
└── done/              # merge concluído; spec validada (referência viva)
    └── <feature>/...
```

| Pasta | Significado | Regras |
| --- | --- | --- |
| `to-do/` | Spec definida, aguardando execução | Pode acumular quantas quiser; é a backlog de intenção. |
| `wip/` | Sendo implementada | Máximo **uma por vez**, no branch `feature/<nome>`. |
| `done/` | Merge concluído e validado | Spec permanece viva para consulta futura (spec-anchored). |

Transição: `git mv specs/to-do/<feature> specs/wip/<feature>` (e depois
`specs/wip/<feature> specs/done/<feature>`). Pastas vazias são preservadas com
`.gitkeep`.

Convenções:
- Nome da feature em `kebab-case` (ex.: `admin-crud-produtos`, `cache-redis`).
- Cada spec vive no branch `feature/<nome>` do repositório atual (sem worktrees),
  no mesmo ritmo do fluxo descrito em `AGENTS.md`.
- Os três arquivos são versionados e mantidos atualizados — **não** são descartados
  após a implementação.
- A pasta é a **fonte canônica** de status; o campo `Status` no metadado do
  `spec.md` espelha o mesmo estado.

## Ciclo de vida de uma spec

```
draft → clarificando → aprovada → em-andamento → implementada → validada → arquivada
```

| Status | Significado | Pasta |
| --- | --- | --- |
| `draft` | Rascunho inicial, seções incompletas. | `to-do/` |
| `clarificando` | Em revisão; ambiguidades listadas em "Decisões em aberto". | `to-do/` |
| `aprovada` | Humano aprovou spec + plan; tasks prontas para execução. | `to-do/` |
| `em-andamento` | Tasks sendo implementadas no branch `feature/<nome>`. | `wip/` |
| `implementada` | Código implementado; falta validação final. | `wip/` |
| `validada` | Lint, build e testes aprovados. | `done/` |
| `arquivada` | Merge concluído; spec continua como referência viva. | `done/` |

O status é registrado no bloco de **Metadados** de cada arquivo. A pasta é a
fonte canônica: mover a pasta é a forma oficial de mudar de status.

## Regras do fluxo (spec-anchored)

1. **Spec antes de código.** Nenhuma mudança de comportamento começa com código;
   começa com `spec.md`.
2. **Contratos e critérios de aceite são fontes de verdade.** O `plan.md` detalha
   contratos de API/dados; o `tasks.md` referencia requisitos (`RF-0x`). Qualquer
   divergência código × spec é bug de spec ou bug de código — resolva na spec.
3. **Mudança pós-merge revisa a spec primeiro.** Nova feature ou correção que
   altera comportamento existente: atualize `spec.md` → `plan.md` → `tasks.md`
   antes de tocar no código.
4. **Rastreabilidade.** Todo requisito vira critério de aceite testável
   (GIVEN/WHEN/THEN) e toda task referencia o requisito que atende.
5. **Validação obrigatória.** `make lint` + `make build` + `make test` (com
   Postgres de pé) antes de declarar `validada`. Evidência via curl/integração
   registrada no `tasks.md`.
6. **Não super-especificar.** Specs devem acelerar o desenvolvimento. Se uma
   seção não reduz ambiguidade, corte-a.

## Definition of Done de uma spec

- [ ] `spec.md` com objetivos, non-goals, requisitos `RF-0x` e critérios de
      aceite.
- [ ] Casos de borda e "Decisões em aberto" resolvidos ou marcados para
      resolver.
- [ ] `plan.md` com decisões técnicas, contratos de dados/API, schema do banco
      e módulos afetados.
- [ ] `tasks.md` atômico (1–4h por task), com dependências e DoD por task.
- [ ] Status `aprovada` no metadado.
