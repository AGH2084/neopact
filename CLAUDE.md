# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Monorepo for Neopact, a B2B marketplace where companies' AI agents negotiate and humans approve the exact offer. `backend/` (FastAPI, Python 3.12, uv), `web/` (Next.js 16, npm), `plugins/claude/` (Claude Code plugin, markdown only). Architecture and design rationale: `docs/ARCHITECTURE.md`; security model: `docs/SECURITY.md`.

## Commands

- Databases for backend tests: `docker compose up -d postgres minio` (repo root). Full stack: `docker compose up --build -d`.
- Backend (from `backend/`): `uv sync --extra mcp`, `uv run pytest -q`, a single test `uv run pytest tests/test_marketplace.py::test_name -q`, lint `uv run ruff check . && uv run ruff format --check .`, schema `uv run alembic check`.
- Web (from `web/`): `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:ui` (mocked API, needs a build), one spec `npx playwright test tests/rules.spec.ts --config playwright.guidance.config.ts`. Set `CHROME_PATH` to use a local browser.

## Invariants to preserve

- The backend is the only authority. Agents (MCP tokens) can never approve orders, change rules or issue credentials; approval is a browser-session action with Origin + CSRF checks.
- Private data (buyer budgets, seller floors, human guidance) must never reach shared actions, events, order evidence or the counterparty's views.
- Every commercial write goes through `service.core.mutation()` (advisory lock). Mutations take an `Idempotency-Key`; agent actions also need `expected_version` and a claim token.
- Contract chain: after changing routes or response models run `uv run python scripts/export_openapi.py` (backend), then `npm run api:generate` (web). Commit both; CI and a backend test fail on drift. Never hand-edit `web/lib/generated/api.d.ts`.
- The dashboard proxy (`web/app/api/v1/[...path]/route.ts`) forwards only an explicit allowlist of human writes. A new UI write needs an entry there plus a test in `tests/proxy.spec.ts`; browser-mocked UI tests won't catch a missing entry.
- Next.js here has breaking changes from older versions; see `web/AGENTS.md`.
