import { NextRequest } from "next/server";
import type { components } from "@/lib/generated/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Human writes the dashboard may forward. Agent operations (claims, actions, products) are
// refused here: agents use the MCP endpoint with their own restricted credentials.
const WRITES: [method: string, path: RegExp][] = [
  ["POST", /^auth\/(session|logout)$/],
  ["POST", /^credentials$/],
  ["DELETE", /^credentials\/[^/]+$/],
  ["POST", /^agent\/prompt$/],
  ["POST", /^approvals\/[^/]+\/(approve|reject)$/],
  ["POST", /^negotiations\/[^/]+\/guidance$/],
  ["PUT", /^rules$/],
  ["PUT", /^products\/[^/]+\/stock$/],
];
const ALLOW = "GET, HEAD, POST, PUT, DELETE";

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const route = path.join("/");
  const isRead = req.method === "GET" || req.method === "HEAD";
  if (
    !isRead &&
    !WRITES.some(
      ([method, pattern]) => method === req.method && pattern.test(route),
    )
  ) {
    return Response.json(
      {
        status_code: 405,
        error: {
          code: "unsupported_dashboard_action",
          message: "This operation is not available from the dashboard",
          details: null,
        },
      } satisfies components["schemas"]["ErrorResponse"],
      { status: 405, headers: { Allow: ALLOW } },
    );
  }
  const headers = new Headers();
  for (const name of [
    "cookie",
    "content-type",
    "origin",
    "x-csrf-token",
    "x-workspace-id",
    "idempotency-key",
  ]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8100"}/api/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`,
      {
        method: req.method,
        headers,
        body: isRead ? undefined : await req.arrayBuffer(),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      },
    );
    const outgoing = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    for (const name of ["content-type", "content-disposition", "location"]) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      {
        status_code: 503,
        error: {
          code: "backend_unavailable",
          message: "The marketplace API is unavailable. Please retry.",
          details: null,
        },
      } satisfies components["schemas"]["ErrorResponse"],
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as HEAD,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};
