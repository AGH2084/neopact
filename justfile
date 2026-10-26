# Developer shortcuts. Each recipe is a plain command you can also run by hand.
set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Start the full stack (Postgres, MinIO, API, worker, MCP endpoint, dashboard).
up:
    test -f backend/.env || cp backend/.env.example backend/.env
    docker compose up --build -d

# Create the fictional demo businesses, catalogue and images (idempotent).
seed:
    docker compose exec api python -m market.manage seed

# Backend lint, migrations check and integration tests (needs Postgres and MinIO).
test-backend:
    cd backend && uv run ruff check . && uv run ruff format --check .
    cd backend && uv run alembic upgrade head && uv run alembic check
    cd backend && uv run pytest -q

# Dashboard typecheck, format, unit tests, build and mocked browser tests.
test-web:
    cd web && npm run api:check && npm run typecheck && npm run format:check
    cd web && npm run test:unit && npm run build && npm run test:ui

# Regenerate the OpenAPI contract from backend code, then the dashboard's types.
api-sync:
    cd backend && uv run python scripts/export_openapi.py
    cd web && npm run api:generate

# Drive the API as scripted buyer and seller agents (no LLM, never approves).
demo-agents:
    cd backend && uv run python scripts/demo_agents.py
