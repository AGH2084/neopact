import { expect, test } from "@playwright/test";
import { connectionSnippets } from "../lib/connections";

const token = "am_" + "x".repeat(54);

test("HTTP snippets send the agent token only as a bearer header", () => {
  const s = connectionSnippets(
    "http://127.0.0.1:8200/mcp",
    "http://127.0.0.1:8100/api/v1",
    "ws-buyer",
    token,
  );
  expect(s.claude).toBe(
    `claude mcp add --transport http neopact http://127.0.0.1:8200/mcp --header "Authorization: Bearer ${token}"`,
  );
  const http = JSON.parse(s.http).mcpServers.neopact;
  expect(http).toEqual({
    type: "http",
    url: "http://127.0.0.1:8200/mcp",
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(http.url).not.toContain(token);
});

test("stdio snippet runs the local server with workspace-scoped environment", () => {
  const s = connectionSnippets(
    "http://127.0.0.1:8200/mcp",
    "http://127.0.0.1:8100/api/v1",
    "ws-nord",
    token,
  );
  const stdio = JSON.parse(s.stdio).mcpServers.neopact;
  expect(stdio.command).toBe("uv");
  expect(stdio.args.at(-1)).toBe("neopact-mcp");
  expect(stdio.env).toEqual({
    NEOPACT_MCP_API_URL: "http://127.0.0.1:8100/api/v1",
    NEOPACT_MCP_WORKSPACE: "ws-nord",
    NEOPACT_MCP_TOKEN: token,
  });
});
