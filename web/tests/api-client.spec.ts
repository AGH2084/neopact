import { expect, test } from "@playwright/test";
import type { components } from "../lib/generated/api";
import {
  ApiError,
  createDashboardApi,
  createMarketplaceClient,
} from "../lib/api";

const baseUrl = "http://dashboard.test";

test("typed catalogue requests unwrap the resource and use the current workspace", async () => {
  let workspace = "buyer-workspace";
  const requests: Request[] = [];
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      workspace: () => workspace,
      csrf: () => "unused-for-reads",
      fetch: async (request) => {
        requests.push(request);
        return Response.json({
          products: { items: [], total: 0, offset: 0, limit: 100 },
          status_code: 200,
        });
      },
    }),
  );

  expect(await api.products()).toEqual([]);
  workspace = "seller-workspace";
  expect(await api.products()).toEqual([]);
  expect(requests.map((request) => request.url)).toEqual([
    `${baseUrl}/api/v1/products?limit=100`,
    `${baseUrl}/api/v1/products?limit=100`,
  ]);
  expect(
    requests.map((request) => request.headers.get("X-Workspace-ID")),
  ).toEqual(["buyer-workspace", "seller-workspace"]);
  for (const request of requests) {
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("same-origin");
    expect(request.cache).toBe("no-store");
    expect(request.headers.has("X-CSRF-Token")).toBe(false);
    expect(request.headers.has("Authorization")).toBe(false);
  }
});

test("human approval sends the exact offer/version with cookie and CSRF transport", async () => {
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      workspace: () => "buyer-workspace",
      csrf: () => "browser-csrf-token",
      fetch: async (request) => {
        expect(request.url).toBe(
          `${baseUrl}/api/v1/approvals/room-123/approve`,
        );
        expect(request.method).toBe("POST");
        expect(request.credentials).toBe("same-origin");
        expect(request.headers.get("X-CSRF-Token")).toBe("browser-csrf-token");
        expect(request.headers.get("Origin")).toBe(baseUrl);
        expect(request.headers.get("X-Workspace-ID")).toBe("buyer-workspace");
        expect(request.headers.get("Content-Type")).toBe("application/json");
        expect(await request.json()).toEqual({
          offer_id: "offer-456",
          expected_version: 7,
        });
        return Response.json({
          approval: { state: "awaiting_approval", order: null },
          status_code: 200,
        } satisfies components["schemas"]["ApprovalAcceptResponse"]);
      },
    }),
  );
  expect(await api.approve("room-123", "offer-456", 7)).toEqual({
    state: "awaiting_approval",
    order: null,
  });
});

test("sign-in and sign-out use their generated request contracts", async () => {
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      workspace: () => null,
      csrf: () => "csrf",
      fetch: async (request) => {
        expect(request.headers.has("X-Workspace-ID")).toBe(false);
        if (request.url.endsWith("/session")) {
          expect(request.headers.get("Origin")).toBe(baseUrl);
          expect(await request.json()).toEqual({
            email: "buyer@example.test",
            password: "example-password",
          });
        } else {
          expect(request.url).toBe(`${baseUrl}/api/v1/auth/logout`);
          expect(await request.text()).toBe("");
          expect(request.headers.get("X-CSRF-Token")).toBe("csrf");
        }
        return Response.json({
          session: { ok: true },
          status_code: 200,
        } satisfies components["schemas"]["BrowserLoginResponse"]);
      },
    }),
  );
  await api.signIn("buyer@example.test", "example-password");
  await api.signOut();
});

test("private human guidance sends a version and stable idempotency key with browser authentication", async () => {
  const negotiation = { id: "room-123", human_guidance: [] };
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      workspace: () => "seller-workspace",
      csrf: () => "human-csrf",
      fetch: async (request) => {
        expect(request.url).toBe(
          `${baseUrl}/api/v1/negotiations/room-123/guidance`,
        );
        expect(request.method).toBe("POST");
        expect(request.headers.get("X-CSRF-Token")).toBe("human-csrf");
        expect(request.headers.get("Origin")).toBe(baseUrl);
        expect(request.headers.get("Idempotency-Key")).toBe(
          "stable-guidance-key",
        );
        expect(request.headers.get("X-Workspace-ID")).toBe("seller-workspace");
        expect(request.headers.has("Authorization")).toBe(false);
        expect(await request.json()).toEqual({
          instruction: "Try a higher price.",
          expected_version: 9,
        });
        return Response.json({ negotiation, status_code: 200 });
      },
    }),
  );
  expect(
    await api.requestGuidance(
      "room-123",
      "Try a higher price.",
      9,
      "stable-guidance-key",
    ),
  ).toEqual(negotiation);
});

test("structured errors preserve the API message, HTTP status and machine code", async () => {
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "permission_denied",
              message: "Buyer access required",
            },
            status_code: 403,
          },
          { status: 403 },
        ),
    }),
  );
  await expect(api.requests()).rejects.toMatchObject({
    name: "ApiError",
    message: "Buyer access required",
    code: "permission_denied",
    status: 403,
  });
});

for (const statusCode of [undefined, 201]) {
  test(`rejects successful responses with ${statusCode === undefined ? "missing" : "mismatched"} envelope status`, async () => {
    const api = createDashboardApi(
      createMarketplaceClient({
        baseUrl,
        fetch: async () =>
          Response.json({
            products: { items: [], total: 0, offset: 0, limit: 100 },
            status_code: statusCode,
          }),
      }),
    );
    await expect(api.products()).rejects.toBeInstanceOf(ApiError);
    await expect(api.products()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
}

test("unstructured proxy errors retain a safe HTTP error message", async () => {
  const api = createDashboardApi(
    createMarketplaceClient({
      baseUrl,
      fetch: async () => Response.json({}, { status: 502 }),
    }),
  );
  await expect(api.me()).rejects.toMatchObject({
    message: "Request failed (502)",
    status: 502,
    code: "request_failed",
  });
});
