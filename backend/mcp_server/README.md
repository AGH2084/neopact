# Neopact MCP server

A typed MCP adapter over the Neopact API, built with FastMCP 3. It exposes 16 tools for reading, buyer requests, seller products, turn claims, typed actions and `wait_for_updates`, plus the `neopact_negotiator` prompt. It has no approval, rules or credential tools, and it never runs a language model.

## Two transports, one package

**HTTP (shared endpoint).** One server for every company. Each request must carry the caller's own restricted agent token; the backend's workspace binding keeps companies apart. The compose stack runs it at `http://127.0.0.1:8200/mcp`.

```sh
NEOPACT_MCP_API_URL=http://127.0.0.1:8100/api/v1 uv run --extra mcp neopact-mcp --transport http --port 8200
claude mcp add --transport http neopact http://127.0.0.1:8200/mcp --header "Authorization: Bearer $NEOPACT_MCP_TOKEN"
```

| Variable | Meaning |
| --- | --- |
| `NEOPACT_MCP_API_URL` | Backend API root ending in `/api/v1`. HTTPS, or HTTP on loopback. |
| `NEOPACT_MCP_TRUSTED_HTTP_HOSTS` | Comma-separated internal hosts allowed over plain HTTP (compose sets `api`). |
| `NEOPACT_MCP_ALLOWED_HOSTS` | Extra `Host` header values to accept, beyond loopback names. |

**Stdio (local process).** One process per workspace, credential from its environment. It is useful for desktop clients that launch servers themselves.

| Variable | Meaning |
| --- | --- |
| `NEOPACT_MCP_API_URL` | As above |
| `NEOPACT_MCP_WORKSPACE` | The workspace ID shown with the credential |
| `NEOPACT_MCP_TOKEN` | The restricted `am_…` agent token |

```json
{ "mcpServers": { "neopact": {
  "command": "uv",
  "args": ["--directory", "/path/to/neopact/backend", "run", "--extra", "mcp", "neopact-mcp"],
  "env": { "NEOPACT_MCP_API_URL": "http://127.0.0.1:8100/api/v1", "NEOPACT_MCP_WORKSPACE": "ws-buyer", "NEOPACT_MCP_TOKEN": "am_…" }
} } }
```

The dashboard's **Connections** page generates both snippets with a fresh token.

## Safety

- **HTTP guard.** Requests without an agent-shaped bearer token get a `401` before an MCP session starts, and Host/Origin checks run in strict mode.
- **Token checks.** Tokens are verified as restricted agent credentials; browser and user tokens are refused. The backend re-checks expiry, revocation, scopes and workspace on every call.
- **Fixed origin.** The client never follows redirects, reads proxy settings, or accepts arbitrary URLs. Backend error messages are sanitized before they reach the agent.

Tests live in `../tests/test_mcp.py` and run each tool over the MCP wire protocol against the real API in an isolated schema.
