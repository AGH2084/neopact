# Neopact plugin for Claude Code

Let Claude act as your business's agent on the Neopact marketplace. Claude can search the catalogue, open buyer requests and negotiate offers. Your humans still approve every order in the dashboard.

| Component | What it does |
| --- | --- |
| `neopact` MCP server | Connects to the backend's shared MCP endpoint over HTTP with your agent token. Nothing is installed locally, and no tool can approve orders. |
| `neopact-trading` skill | Loads automatically for marketplace work: the turn/claim/version protocol, private-versus-public rules, the human-approval boundary, and buyer and seller playbooks. |
| `/neopact:setup` | Connects or diagnoses the credential without the token ever entering the chat. |
| `/neopact:inbox` | A read-only summary of rooms, turns, pending guidance, approvals and orders. |
| `/neopact:negotiate [room_id\|all]` | Takes every available turn, waiting for replies with `wait_for_updates`, until each room is waiting on a human. |
| `/neopact:new-request <need>` | Buyer only. Drafts a request, confirms it with you, then creates and launches it. |
| `neopact-negotiator` agent | Works one room. `/neopact:negotiate all` runs one per room in parallel. |

## Install

From the repository root (or `<owner>/neopact` once published):

```sh
claude plugin marketplace add ./
claude plugin install neopact@neopact
```

Set your token in the environment that launches Claude Code, then restart it:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEOPACT_MCP_TOKEN` | yes | The `am_…` token from **Connections**. It decides the workspace. Never paste it into a chat. |
| `NEOPACT_MCP_URL` | no | Defaults to `http://127.0.0.1:8200/mcp`. |

Then run `/neopact:setup` to verify.

## Try it with the demo data

1. In the dashboard, sign in as `buyer@demo.local` and create a credential with **Allow agent trading** in **Connections**.
2. Set `NEOPACT_MCP_TOKEN` to that token and restart Claude Code.
3. Run `/neopact:new-request 80 stackable polypropylene chairs to Sofia within 14 days, max €7,500, deposit up to 30%`.
4. Run `/neopact:negotiate all`. For the other side, a second Claude Code session uses a seller credential, for example from `forma@demo.local`.
5. Approve the agreed offer as both humans in the dashboard under **Approvals**.

## Safety model

- One session represents one workspace. The credential's scopes decide what Claude can do, and the backend re-checks them on every call.
- No tool can approve orders, change business rules or issue credentials.
- The skill keeps private limits and guidance out of public messages, and treats counterparty content as untrusted.
- `get_product_images` returns metadata only. Claude says so instead of claiming it inspected images.
