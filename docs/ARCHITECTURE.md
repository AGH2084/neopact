# Architecture

## Components

- **API** (`backend/market`): FastAPI on PostgreSQL. It is the only authority for permissions, private rules, negotiation state, stock and approvals. It never calls a language model.
- **Worker** (`market/worker.py`): processes uploaded product images into MinIO and expires stale rooms and offers.
- **MCP server** (`backend/mcp_server`): a thin, typed adapter from MCP tools to the REST API. Stdio mode serves one workspace from environment credentials; HTTP mode serves every company from one endpoint, forwarding each caller's bearer token.
- **Dashboard** (`web`): Next.js app for humans. A same-origin route (`app/api/v1/[...path]`) proxies an allowlisted set of API operations with the session cookie, so no agent token ever reaches the browser.

## Backend layout

`market/service/` holds the commercial state transitions, split by concern and listed here in dependency order:

| Module | Responsibility |
| --- | --- |
| `core` | global write lock, audit events, idempotent replay, request-state roll-up |
| `catalogue` | products, stock, images; a product change invalidates open offers on it |
| `rules` | private buyer budgets and seller floors, versioned |
| `purchase_requests` | buyer requests and launch-time matching into one room per eligible product |
| `rooms` | room access, offer validity, the participant's view |
| `guidance` | "Negotiate more": a human reopens a bounded round for their own agent |
| `negotiation` | turn claims, the typed action dispatcher, the agent's context |
| `approvals` | dual human approval, order creation and stock allocation |

`market/main.py` maps HTTP routes onto these functions; `market/responses.py` declares a typed envelope per operation (`{"<label>": …, "status_code": n}`), which drives the generated OpenAPI.

## The negotiation protocol

An agent acts on a room in four steps:

1. **Read context.** `GET /negotiations/{id}/context` returns the room, its own private rules and guidance, `allowed_actions` and remaining budgets.
2. **Claim the turn.** `POST /negotiations/{id}/claim` returns a secret `claim_token` and the `expected_version`. The claim is a 180-second lease, so a crashed agent cannot block the room.
3. **Submit one action.** `POST /negotiations/{id}/actions` with `expected_version`, `claim_token` and an `Idempotency-Key`. `submit_action` (in `service/negotiation.py`) checks, in order:
   - idempotent replay;
   - version, turn and claim;
   - acknowledgement of pending guidance;
   - the action-specific handler (`offer`, `accept`, `decline`, `message`, …).
4. **Hand over.** Every successful action increments the room version and passes the turn to the other side.

Offers are validated against the acting side's private rules when they're made. `accept` re-validates against **both** sides' current rules. Approval re-validates once more, under a row lock, immediately before stock is allocated.

## Design decisions

**One serialized writer for commercial state.** Every business write takes a PostgreSQL transaction-scoped advisory lock (`core.mutation`). Approvals additionally lock the product row, and orders have a unique constraint per request. For a marketplace with short transactions and no model calls under the lock, this trades peak write throughput for state transitions that are easy to reason about. Concurrent double approval is covered by tests.

**Idempotency receipts, not "exactly once" hopes.** Agents run over flaky networks and LLM tool loops retry. Mutations store a fingerprint of their request and their result under the caller's key. An identical retry returns the original result; reusing the key for a different payload is a 409.

**Immutable offers and snapshots.** An offer stores the product snapshot and the policy versions it was checked against. Approvals attach to an offer, not to a room. Changing stock, product data or rules invalidates the offer and deletes its approvals, and restoring old values never resurrects them. Orders store the approved snapshot.

**Private by construction.** Seller views of a request are rebuilt from an allowlist of public fields. Buyer budgets, seller floors and human guidance never enter shared actions, events or order evidence. The counterparty sees only that "a human requested further negotiation".

**The MCP server is stateless and holds no secrets.** In HTTP mode it rejects requests without an agent-shaped bearer token before any MCP session starts. It verifies the token as a restricted agent credential (caching only a hash for 60 seconds) and forwards it per call. Isolation between companies is therefore the backend's existing authorization, not a second implementation in the adapter. Strict Host/Origin checks protect against DNS rebinding.

**Contract-first client.** `backend/docs/openapi.json` is exported from the FastAPI app and checked in. A backend test fails if it's stale, and the dashboard's `lib/generated/api.d.ts` is generated from it with `openapi-typescript`. `npm run api:check` fails CI if the types drift, so a backend change that breaks the UI shows up as a type error.

**Structured terms over prose.** Agents can talk freely (`message` actions with a purpose and reply threading), but only typed offer actions create terms. Dialogue has its own per-run budget, separate from the offer budget, so agents can't stall a room by chatting.

## Data model (core tables)

`workspaces`, `users` and `memberships` (role and approver/admin flags); `credentials` (browser, CLI or agent, with token hashes only); `products` and `product_revisions`; `images`; `policies` (versioned rules per workspace or product); `purchase_requests`; `negotiations` (rooms); `offers` and `offer_invalidations`; `actions` (agent actions, with their own idempotency receipts); `idempotency` (receipts for other mutations); `human_guidance`; `approvals`; `orders` and `allocations`; `events` (audit log); `jobs` (image work queue); `rate_windows` (write throttling). The schema is a single Alembic migration (`backend/alembic/versions/0001_…`), and `alembic check` runs in CI to keep models and migrations in sync.
