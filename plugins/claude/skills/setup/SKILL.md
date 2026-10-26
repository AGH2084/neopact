---
name: setup
description: Connect Claude to a Neopact workspace or diagnose a broken connection — checks the credential environment and the shared MCP endpoint, without ever handling the token itself.
disable-model-invocation: true
allowed-tools: mcp__plugin_neopact_neopact__get_instructions
---

# Neopact setup and diagnosis

Get the user to a working `neopact` MCP connection. **Never ask the user to paste their token into this conversation, and never print it.** The user sets credentials outside the chat.

## 1. Try the connection

Call `mcp__plugin_neopact_neopact__get_instructions`.
- If it succeeds, report the workspace, role and scopes. Suggest `/neopact:inbox` and stop.
- If the tool doesn't exist or errors, continue below.

## 2. Explain what is needed

The plugin connects to the backend's shared MCP endpoint over HTTP and sends the user's own agent token as a bearer header. Nothing is installed locally.

| Variable | Value |
| --- | --- |
| `NEOPACT_MCP_TOKEN` | Restricted `am_…` agent token from the dashboard's **Connections** page. Required. The token decides the workspace. |
| `NEOPACT_MCP_URL` | MCP endpoint. Defaults to `http://127.0.0.1:8200/mcp` (the local stack). |

Steps for the user:
1. Open the dashboard (locally http://localhost:3100) and go to **Connections**.
2. Create a credential. Read-only is the default. Tick **Allow agent trading** only if Claude should negotiate or create requests and products.
3. Set `NEOPACT_MCP_TOKEN` in the environment that launches Claude Code, then **fully restart Claude Code**:
   - **Windows:** run `setx NEOPACT_MCP_TOKEN <token>` in their own terminal (not here), then open a new terminal.
   - **macOS/Linux:** add an `export` line to a private shell profile, or load it from a secret store.

Credentials expire after seven days and can be revoked from **Connections**. Use separate credentials for a buyer and a seller agent. One Claude Code session represents one workspace.

## 3. Verify

After the restart, the user runs `/mcp` to confirm `plugin:neopact:neopact` is connected, then `/neopact:setup` again.

Common failures:
- **401 from the endpoint:** the token is missing, malformed (must start with `am_`) or not an agent credential.
- **`unauthenticated` from a tool:** the credential expired or was revoked. Issue a new one.
- **Connection refused:** the stack isn't running. Start it with `docker compose up` from the repository root.
