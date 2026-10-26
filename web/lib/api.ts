import createClient, { type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./generated/api";

// These are aliases of the backend contract, never independently maintained DTOs.
export type ImageAsset = components["schemas"]["ImageAsset"];
export type Product = components["schemas"]["Product"];
export type PurchaseRequest = components["schemas"]["PurchaseRequest"];
export type Offer = components["schemas"]["Offer"];
export type Room = components["schemas"]["Room"];
export type Order = components["schemas"]["Order"];
export type AuditEvent = components["schemas"]["AuditEvent"];
export type Workspace = components["schemas"]["Workspace"];
export type Me = components["schemas"]["Me"];
export type Rules = components["schemas"]["Rules"];
export type RulesInput = components["schemas"]["PolicyInput"]["rules"];
export type BuyerPolicy = components["schemas"]["BuyerPolicy"];
export type SellerPolicy = components["schemas"]["SellerPolicy"];

export const can = (me: Me, scope: string) =>
  me.credential.scopes.includes(scope);

export const money = (cents: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const human = (value: string) => value.replaceAll("_", " ");
export function setWorkspace(id: string) {
  localStorage.setItem("market_workspace", id);
}

function currentWorkspace() {
  return typeof localStorage === "undefined"
    ? null
    : localStorage.getItem("market_workspace");
}
function currentCsrf() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("market_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") || "",
  );
}

type ClientConfig = Pick<ClientOptions, "baseUrl" | "fetch"> & {
  workspace?: () => string | null;
  csrf?: () => string;
};

/** Cookie authentication stays in the same-origin proxy; no agent tokens enter the browser. */
export function createMarketplaceClient({
  workspace = currentWorkspace,
  csrf = currentCsrf,
  ...options
}: ClientConfig = {}) {
  const client = createClient<paths>({
    baseUrl: "",
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  client.use({
    onRequest({ request }) {
      const workspaceId = workspace();
      if (workspaceId) request.headers.set("X-Workspace-ID", workspaceId);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        request.headers.set("X-CSRF-Token", csrf());
      }
      return request;
    },
  });
  return Object.assign(client, {
    browserHeaders() {
      // Origin is browser-controlled on the wire. An explicit base URL supports
      // server-side transport tests without weakening the generated header contract.
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : new URL(options.baseUrl || "").origin;
      return { Origin: origin, "X-CSRF-Token": csrf() };
    },
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Preserve generated success types while converting API/proxy failures into UI errors. */
export function responseData<T extends { status_code: number }>({
  data,
  error,
  response,
}: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (!response.ok) {
    const problem = record(error) && record(error.error) ? error.error : null;
    throw new ApiError(
      problem && typeof problem.message === "string"
        ? problem.message
        : `Request failed (${response.status})`,
      response.status,
      problem && typeof problem.code === "string"
        ? problem.code
        : "request_failed",
    );
  }
  if (!data || data.status_code !== response.status) {
    throw new ApiError(
      "The API returned an unexpected response. Refresh and try again.",
      response.status,
      "invalid_response",
    );
  }
  return data;
}

/** Every route, parameter, body and result below is inferred from generated OpenAPI types. */
export function createDashboardApi(client = createMarketplaceClient()) {
  return {
    async me() {
      return responseData(await client.GET("/api/v1/auth/me")).identity;
    },
    async workspaces() {
      return responseData(await client.GET("/api/v1/workspaces")).workspaces
        .items;
    },
    async products() {
      return responseData(
        await client.GET("/api/v1/products", {
          params: { query: { limit: 100 } },
        }),
      ).products.items;
    },
    async requests() {
      return responseData(
        await client.GET("/api/v1/requests", {
          params: { query: { limit: 100 } },
        }),
      ).requests.items;
    },
    async rooms() {
      return responseData(
        await client.GET("/api/v1/negotiations", {
          params: { query: { limit: 100 } },
        }),
      ).negotiations.items;
    },
    async room(id: string) {
      return responseData(
        await client.GET("/api/v1/negotiations/{room_id}", {
          params: { path: { room_id: id } },
        }),
      ).negotiation;
    },
    async orders() {
      return responseData(
        await client.GET("/api/v1/orders", {
          params: { query: { limit: 100 } },
        }),
      ).orders.items;
    },
    async activity() {
      return responseData(
        await client.GET("/api/v1/activity", {
          params: { query: { limit: 100 } },
        }),
      ).activity.items;
    },
    async rules(productId?: string) {
      return responseData(
        await client.GET("/api/v1/rules", {
          params: { query: { product_id: productId } },
        }),
      ).rules;
    },
    async setRules(
      rules: RulesInput,
      expectedVersion: number,
      productId?: string,
    ) {
      return responseData(
        await client.PUT("/api/v1/rules", {
          params: { query: { product_id: productId } },
          body: { rules, expected_version: expectedVersion },
        }),
      ).rules;
    },
    async setStock(productId: string, stock: number, expectedVersion: number) {
      return responseData(
        await client.PUT("/api/v1/products/{product_id}/stock", {
          params: { path: { product_id: productId } },
          body: { stock, expected_version: expectedVersion },
        }),
      ).product;
    },
    async signIn(email: string, password: string) {
      return responseData(
        await client.POST("/api/v1/auth/session", {
          params: { header: client.browserHeaders() },
          body: { email, password },
        }),
      ).session;
    },
    async signOut() {
      return responseData(await client.POST("/api/v1/auth/logout")).session;
    },
    async approve(roomId: string, offerId: string, expectedVersion: number) {
      return responseData(
        await client.POST("/api/v1/approvals/{room_id}/approve", {
          params: {
            path: { room_id: roomId },
            header: client.browserHeaders(),
          },
          body: { offer_id: offerId, expected_version: expectedVersion },
        }),
      ).approval;
    },
    async reject(roomId: string, offerId: string, expectedVersion: number) {
      return responseData(
        await client.POST("/api/v1/approvals/{room_id}/reject", {
          params: {
            path: { room_id: roomId },
            header: client.browserHeaders(),
          },
          body: { offer_id: offerId, expected_version: expectedVersion },
        }),
      ).approval;
    },
    async requestGuidance(
      roomId: string,
      instruction: string,
      expectedVersion: number,
      idempotencyKey: string,
    ) {
      return responseData(
        await client.POST("/api/v1/negotiations/{room_id}/guidance", {
          params: {
            path: { room_id: roomId },
            header: {
              ...client.browserHeaders(),
              "Idempotency-Key": idempotencyKey,
            },
          },
          body: { instruction, expected_version: expectedVersion },
        }),
      ).negotiation;
    },
  };
}

export const api = createDashboardApi();
export type EffectiveRules = Awaited<ReturnType<typeof api.rules>>["effective"];

export function imageUrl(image: ImageAsset, thumb = false) {
  const path = thumb ? image.thumbnail_path : image.content_path;
  const workspace = currentWorkspace() || "";
  return `/api/v1${path}${path.includes("?") ? "&" : "?"}workspace_id=${encodeURIComponent(workspace)}`;
}
