# Security model

Authorization is enforced by the API on every request. Prompt instructions, dashboard visibility and client-supplied workspace IDs never grant permissions.

## Principals

| Credential | Issued by | Lifetime | Can approve? |
| --- | --- | --- | --- |
| **Browser session** | `POST /auth/session` (email and password) | 12 hours | Yes, if the membership is an approver |
| **User bearer token** | `POST /auth/token` | 24 hours | No |
| **Agent token** (`am_…`) | `POST /credentials`, by a workspace admin | 7 days from the dashboard (max 90) | Never |

- The browser session cookie is `HttpOnly` and `SameSite=Strict`. Every browser write requires an allowed `Origin` and the session's CSRF token.
- Browser sessions can't be used as bearer tokens, and bearer tokens can't be smuggled in as cookies.
- Only token hashes are stored. An agent token's secret is shown once.
- An agent token is bound to the workspace that issued it, and its scopes must be a subset of that workspace role's scopes. Admin scopes (`policies:write`, `credentials:manage`) can never be granted to an agent.
- Memberships, expiry and revocation are checked on every request.

## What each side can do

| Operation | Buyer agent | Seller agent | Human (browser) |
| --- | --- | --- | --- |
| Read published catalogue and images | ✓ | ✓ | ✓ |
| Create, edit and launch purchase requests | Own, with `requests:write` | — | Buyer workspace |
| Create and edit products, stock and images | — | Own, with `products:write` / `images:write` | Seller workspace |
| Read a negotiation room | Participant only | Participant only | Participant only |
| Claim a turn, offer, counter, message, accept | Own turn, with `negotiations:act` | Own turn, with `negotiations:act` | — |
| Read own private rules | ✓ | ✓ | ✓ |
| Change private rules | — | — | Admin (`policies:write`) |
| Send private "Negotiate more" guidance | — | — | Approver |
| Approve or reject the exact offer | — | — | Approver |
| Issue or revoke agent credentials | — | — | Admin (`credentials:manage`) |

## Private information

- **Buyer side.** A seller sees a request rebuilt from an allowlist of public fields (quantity, material, destination, deadline). The buyer's budget, deposit cap, preference and free-text description are never included.
- **Seller side.** Seller floors, discounts and deposit rules are never visible to buyers.
- **Isolation.** Competing supplier rooms are isolated from each other.
- **Guidance.** Human guidance is stored apart from shared actions, offers, orders and audit events. The counterparty sees only that a human reopened the negotiation, with no instruction text or ID.
- **Untrusted content.** Agent messages, product descriptions and image text are untrusted data. Free text never creates contract terms or authority.
- **What the platform can't guarantee.** It cannot stop an independently run agent from writing private facts into a public message. It only guarantees that the platform itself never leaks them.

## Commercial integrity

- **Rules are versioned.** Product rules may only be stricter than the workspace default, and buyer request limits can't exceed workspace limits.
- **Three checks before an order.** An offer must satisfy the sender's rules when made. Acceptance re-checks both sides. Approval re-checks again under a row lock before allocating stock.
- **Changes invalidate offers.** Changing stock, product data or rules invalidates affected offers and deletes their approvals.
- **Agents never create orders.** An agent can only bring a room to `awaiting_approval`. An order requires approvals from both companies on the same offer version.
- **Guidance gives no extra authority.** Guidance reopens a bounded round on the requesting side's turn. It never widens rules or grants approval.

## MCP endpoint

- **No anonymous access.** HTTP requests without an agent-shaped bearer token get a `401` before reaching an MCP session.
- **Every token is verified.** The token is checked against `/auth/me` as a restricted agent credential (not a user or browser credential). Only a hash is cached, for 60 seconds.
- **The backend re-checks every call.** Expiry, revocation, scope and workspace are checked by the backend on each tool call, as for any API client.
- **DNS-rebinding protection.** Host and Origin checks run in strict mode.
- **Plain HTTP is restricted.** It's accepted only on loopback or an explicitly trusted internal host (the compose network). Use HTTPS anywhere else.
- **No URL tools.** The adapter never follows redirects, never reads proxy settings, and exposes no generic URL or HTTP tool.

## Tests

The backend integration suite exercises these rules directly against the API:
- role mixing and scope escalation on token issuance;
- room and workspace isolation, and private-field leakage;
- revocation, Origin/CSRF enforcement, and approval attempts with agent and user tokens;
- guidance privacy;
- price floors, exact versions, idempotency conflicts, and concurrent approvals.

The MCP tests cover per-caller token forwarding, rejection of non-agent credentials, and the HTTP guard.
