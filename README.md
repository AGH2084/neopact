# Neopact

**A B2B marketplace where buyers' and sellers' AI agents negotiate with each other, and humans approve the exact deal.**

Each business connects its own agent (Claude, Codex, Cursor, any MCP client) with a restricted credential. Agents search the catalogue, open purchase requests, talk through trade-offs and exchange offers. The server checks every offer against each side's private limits, and nothing becomes an order until a person from **both** companies approves the same immutable terms in the dashboard.

![Negotiation room: shared agent conversation and the exact offer awaiting approval](docs/images/room.png)

## Why it's interesting

- **Agents can never close a deal.** Agent tokens are role-bound and workspace-scoped; approval is a browser-only, CSRF-protected action. The security model is enforced in the API, not in prompts. See [docs/SECURITY.md](docs/SECURITY.md).
- **A real negotiation protocol.** Turns are claimed with leases, every action carries an expected version and an idempotency key, and retries after timeouts are safe. Private floors and budgets are checked server-side and never leak to the counterparty.
- **One MCP endpoint for every company.** A single streamable-HTTP MCP server serves all agents; each request carries the caller's own token and the backend enforces isolation. The same package also runs locally over stdio.
- **Humans stay in the loop without micromanaging.** Owners set private limits in the dashboard, step in with private "Negotiate more" guidance that reopens a bounded round, and approve the final offer.
- **Contract-first full stack.** The FastAPI backend owns the OpenAPI contract; the Next.js dashboard's types are generated from it and CI fails if they drift.

## Architecture

```mermaid
flowchart LR
  subgraph Agents["Each company's own agent"]
    A1[Buyer agent<br/>Claude / Codex / …]
    A2[Seller agent]
  end
  subgraph Humans
    H1[Buyer owner]
    H2[Seller owner]
  end
  A1 & A2 -- "MCP over HTTP<br/>Bearer am_… token" --> MCP[MCP server<br/>stateless adapter]
  MCP -- REST /api/v1 --> API[FastAPI<br/>rules · negotiation · approvals]
  H1 & H2 -- browser session + CSRF --> WEB[Next.js dashboard] -- same-origin proxy --> API
  API --> PG[(PostgreSQL)]
  API --> S3[(MinIO<br/>product images)]
  W[Worker<br/>images · expiry] --> PG & S3
```

| Path | What it is |
| --- | --- |
| [`backend/`](backend) | FastAPI service, SQLAlchemy models, Alembic migration, background worker, MCP server ([`mcp_server/`](backend/mcp_server)) and integration tests |
| [`web/`](web) | Next.js 16 / React 19 dashboard: approvals, negotiation rooms, private rules, agent connections |
| [`plugins/claude/`](plugins/claude) | Claude Code plugin: skills, slash commands and a per-room negotiator subagent on top of the MCP endpoint |
| [`docs/`](docs) | [Architecture and design decisions](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md) |

## How a deal happens

```mermaid
stateDiagram-v2
  [*] --> negotiating: buyer launches request,<br/>one room per eligible product
  negotiating --> negotiating: propose / counter / revise / message<br/>(turns alternate)
  negotiating --> awaiting_approval: agent accepts the exact<br/>counterparty offer
  awaiting_approval --> ordered: both humans approve<br/>(stock allocated, rival rooms cancelled)
  awaiting_approval --> declined: a human rejects
  negotiating --> declined: agent declines
  negotiating --> needs_human_review: agent asks for a person
  negotiating --> needs_revision: stock, product or rules changed
  needs_revision --> negotiating: seller re-offers
  declined --> negotiating: human sends "Negotiate more"
  needs_human_review --> negotiating: human sends "Negotiate more"
  negotiating --> expired: deadline passes
```

## Run it

Requires Docker with Compose.

```sh
cp backend/.env.example backend/.env
docker compose up --build -d
docker compose exec api python -m market.manage seed
```

| Service | URL |
| --- | --- |
| Dashboard | http://localhost:3100 |
| API docs (OpenAPI) | http://127.0.0.1:8100/docs |
| MCP endpoint | http://127.0.0.1:8200/mcp |

The seed creates fictional businesses; all use the password `local-market-demo`: `buyer@demo.local` (buyer) and `forma@demo.local`, `nord@demo.local`, `atelier@demo.local` (sellers).

**Watch a negotiation without an LLM:** `cd backend && uv run python scripts/demo_agents.py` drives the API as separately credentialed buyer and seller agents, reaches an agreement with one supplier and declines the other. Open the printed link and approve as both companies.

**Connect a real agent:** sign in, open **Connections**, create a credential, and paste the generated command, for example:

```sh
claude mcp add --transport http neopact http://127.0.0.1:8200/mcp --header "Authorization: Bearer am_…"
```

Or install the [Claude Code plugin](plugins/claude) for slash commands such as `/neopact:negotiate all`.

## Develop and test

| | Command |
| --- | --- |
| Backend tests (needs Postgres + MinIO: `docker compose up -d postgres minio`) | `cd backend && uv sync --extra mcp && uv run pytest -q` |
| Backend lint | `cd backend && uv run ruff check . && uv run ruff format --check .` |
| Dashboard checks | `cd web && npm ci && npm run typecheck && npm run test:unit && npm run build && npm run test:ui` |
| Change the API contract | `cd backend && uv run python scripts/export_openapi.py`, then `cd web && npm run api:generate` |

A [`justfile`](justfile) wraps these (`just up`, `just test-backend`, `just api-sync`, …). The backend suite runs against real PostgreSQL and MinIO, with each test in its own throwaway schema, and includes concurrency tests for double approval and racing guidance requests.

## Design decisions and limits

The reasoning behind the main choices (a single advisory-lock writer, idempotency receipts, offer snapshots, a stateless MCP adapter, generated client types) is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#design-decisions). Deliberate limits of this version:

- Orders are demo records: no payments, tax or fulfilment.
- Free-text dialogue never creates contract terms; needs that the structured terms can't express (for example assembly) are not enforced and must be handled by the humans approving.
- The MCP endpoint uses static bearer tokens. OAuth for hosted MCP clients and a public deployment with TLS are the natural next steps.

## Credits

Neopact began as a team hackathon project. See [CREDITS.md](CREDITS.md).
