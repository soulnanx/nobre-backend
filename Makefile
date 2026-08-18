# Loja — Backend
# Atalhos para o servidor Hono + Postgres 16 (ver README.md).

BACKEND := backend
COMPOSE := $(BACKEND)/docker-compose.yml

.PHONY: help install infra-up infra-down migrate seed dev api-up api-down lint build test

help: ## Lista todos os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Instala as dependências do backend
	cd $(BACKEND) && npm install

infra-up: ## Sobe o PostgreSQL (porta 5433) via Compose
	docker compose -f $(COMPOSE) up -d postgres

infra-down: ## Derruba o PostgreSQL
	docker compose -f $(COMPOSE) rm -sf postgres || true

migrate: ## Aplica as migrações do banco
	cd $(BACKEND) && npm run db:migrate

seed: ## Popula os 6 produtos no banco
	cd $(BACKEND) && npm run db:seed

dev: ## Sobe a API em modo dev (porta 3001; requer Postgres de pé)
	cd $(BACKEND) && npm run dev

api-up: ## Sobe a stack completa (postgres + api) via Compose
	docker compose -f $(COMPOSE) up -d --build

api-down: ## Derruba a stack completa
	docker compose -f $(COMPOSE) down

lint: ## Roda o ESLint no backend (erros zerados)
	cd $(BACKEND) && npm run lint

build: ## Compila o TypeScript (typecheck + emit para dist/)
	cd $(BACKEND) && npm run build

test: ## Roda os testes (unit + integração; requer Postgres de pé)
	cd $(BACKEND) && npm test