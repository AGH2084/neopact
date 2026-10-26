import { createMarketplaceClient, responseData } from "./api";
import type { components } from "./generated/api";
export type Credential = components["schemas"]["Credential"];
export type IssuedCredential = components["schemas"]["IssuedCredential"];
export type AgentPrompt = components["schemas"]["AgentPrompt"];
export type AgentPromptInput = components["schemas"]["AgentPromptInput"];
const client = createMarketplaceClient();
export const connectionsApi = {
  async prompt(body: AgentPromptInput): Promise<AgentPrompt> {
    return responseData(
      await client.POST("/api/v1/agent/prompt", {
        params: { header: client.browserHeaders() },
        body,
      }),
    ).agent_prompt;
  },
  async list() {
    return responseData(await client.GET("/api/v1/credentials")).credentials
      .items;
  },
  async create(name: string, scopes: string[]) {
    return responseData(
      await client.POST("/api/v1/credentials", {
        params: { header: client.browserHeaders() },
        body: { name, scopes, expires_days: 7 },
      }),
    ).credential;
  },
  async revoke(id: string) {
    return responseData(
      await client.DELETE("/api/v1/credentials/{credential_id}", {
        params: {
          path: { credential_id: id },
          header: client.browserHeaders(),
        },
      }),
    ).credential;
  },
};

/** Snippets for the two ways an agent connects: the shared HTTP endpoint or a local stdio process. */
export function connectionSnippets(
  endpoint: string,
  apiUrl: string,
  workspaceId: string,
  token: string,
) {
  return {
    claude: `claude mcp add --transport http neopact ${endpoint} --header "Authorization: Bearer ${token}"`,
    http: JSON.stringify(
      {
        mcpServers: {
          neopact: {
            type: "http",
            url: endpoint,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    ),
    stdio: JSON.stringify(
      {
        mcpServers: {
          neopact: {
            command: "uv",
            args: [
              "--directory",
              "/path/to/neopact/backend",
              "run",
              "--extra",
              "mcp",
              "neopact-mcp",
            ],
            env: {
              NEOPACT_MCP_API_URL: apiUrl,
              NEOPACT_MCP_WORKSPACE: workspaceId,
              NEOPACT_MCP_TOKEN: token,
            },
          },
        },
      },
      null,
      2,
    ),
  };
}
