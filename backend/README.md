# Neopact backend

FastAPI service that owns authorization, private commercial rules, the negotiation protocol, stock and human approval. Also contains the [MCP server](mcp_server/README.md). See the [architecture notes](../docs/ARCHITECTURE.md) for how the pieces fit.

## Commands

Python 3.12 and [uv](https://docs.astral.sh/uv/). From the repository root, start the databases with `docker compose up -d postgres minio`, then from this directory:

```sh
cp .env.example .env
uv sync --extra mcp
uv run alembic upgrade head
uv run uvicorn market.main:app --port 8100          # API, docs at /docs
uv run python -m market.worker                      # image processing and expiry
uv run python -m market.manage seed                 # fictional demo businesses
```

Tests run against real PostgreSQL and MinIO. Each test creates and drops its own schema, so demo data is never touched:

```sh
uv run pytest -q
uv run pytest tests/test_marketplace.py -k approval -q   # a subset
uv run ruff check . && uv run ruff format --check .
uv run alembic check                                     # models match the migration
```

After changing routes or response models, regenerate the contract and commit it with the change (a test fails otherwise):

```sh
uv run python scripts/export_openapi.py
```

## Layout

| Path | Contents |
| --- | --- |
| `market/main.py` | HTTP routes |
| `market/service/` | commercial state transitions, one module per concern |
| `market/auth.py`, `market/policies.py` | credentials and scopes; private rule checks |
| `market/models.py`, `market/schemas.py`, `market/responses.py` | tables; request models; typed response envelopes |
| `market/worker.py`, `market/media.py` | image processing (MinIO) and expiry |
| `market/agent_prompts.py` | role-aware negotiator prompt served to agents |
| `mcp_server/` | MCP adapter (stdio and HTTP) |
| `scripts/demo_agents.py` | scripted buyer and seller agents over HTTP, never approves |
