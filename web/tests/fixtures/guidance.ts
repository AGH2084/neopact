import type { Page, Route } from "@playwright/test";
import type {
  Me,
  Offer,
  Order,
  Product,
  PurchaseRequest,
  Room,
} from "../../lib/api";

const timestamp = "2026-10-10T09:00:00Z";
const product: Product = {
  id: "product-1",
  workspace_id: "seller-workspace",
  supplier: "Chair seller",
  name: "Dining chair",
  description: "Black fabric chair with woven back",
  sku: "CHAIR-1",
  category: "chairs",
  attributes: { material: "fabric", stackable: false, color: "black" },
  unit_price: 14000,
  delivery_charge: 24000,
  lead_days: 12,
  destinations: ["Sofia"],
  stock: 8,
  published: true,
  version: 1,
  cover_id: null,
  images: [],
};
const request: PurchaseRequest = {
  id: "request-1",
  workspace_id: "buyer-workspace",
  state: "awaiting_approval",
  version: 1,
  created_at: timestamp,
  title: "Eight dining chairs",
  description: "Eight chairs for Sofia",
  category: "chairs",
  quantity: 8,
  material: "fabric",
  stackable: false,
  destination: "Sofia",
  latest_delivery: "2026-10-24",
};
const offer: Offer = {
  id: "offer-1",
  version: 1,
  sender: "seller",
  terms: {
    unit_price: 11750,
    quantity: 8,
    delivery_date: "2026-10-22",
    deposit_percent: 20,
    currency: "EUR",
    delivery_charge: 24000,
    total: 118000,
    tax_treatment: "Included",
  },
  product,
  expires_at: "2026-10-12T09:00:00Z",
  created_at: timestamp,
  approvals: [],
};

export function exampleRoom(): Room {
  return structuredClone({
    id: "room-1",
    request_id: request.id,
    seller_id: product.workspace_id,
    supplier: product.supplier,
    product_id: product.id,
    state: "awaiting_approval",
    version: 7,
    run: 1,
    next_role: "buyer",
    reason: null,
    expires_at: "2026-10-12T09:00:00Z",
    agent_status: "waiting_for_agent",
    request,
    product,
    offers: [offer],
    current_offer: offer,
    valid: true,
    invalid_reasons: [],
    activity: [],
    human_guidance: [],
    can_request_guidance: true,
    approval_url: "/?view=approvals&room=room-1",
  });
}

export type GuidanceSubmission = {
  instruction: string;
  expected_version: number;
};

/** All API traffic is intercepted, so these UI tests never alter a running marketplace. */
export async function mockMarketplace(
  page: Page,
  role: "buyer" | "seller" = "buyer",
) {
  const rooms = { buyer: exampleRoom(), seller: exampleRoom() };
  const workspaces = (["buyer", "seller"] as const).map((value) => ({
    id: `${value}-workspace`,
    name: value === "buyer" ? "Chair buyer" : "Chair seller",
    role: value,
  }));
  const submissions: { body: GuidanceSubmission; key: string | undefined }[] =
    [];
  const state = {
    rooms,
    orders: { buyer: [] as Order[], seller: [] as Order[] },
    submissions,
    /** Effective scopes of the signed-in human; owners also hold policies:write. */
    scopes: ["negotiations:read", "policies:write"] as string[],
    rules: {
      buyer: {
        version: 1,
        rules: { max_total: 120000, max_deposit_percent: 40 },
      },
      seller: {
        version: 1,
        rules: {
          min_unit_price: 10000,
          max_discount_percent: 10,
          min_deposit_percent: 20,
          discount_min_quantity: 5,
        },
      },
    } as Record<
      "buyer" | "seller",
      { version: number; rules: Record<string, number> }
    >,
    ruleWrites: [] as {
      expected_version: number;
      rules: Record<string, number>;
    }[],
    handler: null as
      | null
      | ((route: Route, body: GuidanceSubmission) => Promise<void>),
  };
  const envelope = (label: string, data: unknown) => ({
    [label]: data,
    status_code: 200,
  });
  const pageOf = (items: unknown[]) => ({
    items,
    total: items.length,
    offset: 0,
    limit: 100,
  });
  await page.route("**/api/v1/**", async (route) => {
    const incoming = route.request();
    const selected =
      incoming.headers()["x-workspace-id"] === "seller-workspace"
        ? "seller"
        : incoming.headers()["x-workspace-id"] === "buyer-workspace"
          ? "buyer"
          : role;
    const room = rooms[selected];
    const path = new URL(incoming.url()).pathname;
    if (path.startsWith("/api/v1/images/")) {
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#93a591"/></svg>',
      });
    }
    let payload: unknown;
    if (incoming.method() === "POST" && path.endsWith("/guidance")) {
      const body = incoming.postDataJSON() as GuidanceSubmission;
      submissions.push({
        body,
        key: incoming.headers()["idempotency-key"],
      });
      if (state.handler) return state.handler(route, body);
      room.version++;
      room.run++;
      room.state = "needs_revision";
      room.next_role = selected;
      room.current_offer!.approvals = [];
      room.valid = false;
      room.invalid_reasons = ["A new offer and both approvals are required"];
      room.human_guidance.unshift({
        id: `guidance-${submissions.length}`,
        role: selected,
        instruction: body.instruction,
        status: "pending",
        run: room.run,
        created_at: timestamp,
        applied_at: null,
      });
      payload = envelope("negotiation", room);
    } else if (path.endsWith("/auth/me")) {
      const identity: Me = {
        user: { id: "user-1", name: "Demo Human", email: "demo@test.local" },
        workspace: workspaces.find((workspace) => workspace.role === selected)!,
        credential: { id: "browser-1", kind: "browser", scopes: state.scopes },
        can_approve: true,
        demo: true,
      };
      payload = envelope("identity", identity);
    } else if (path.endsWith("/workspaces")) {
      payload = envelope("workspaces", { items: workspaces });
    } else if (path.endsWith("/products")) {
      payload = envelope("products", pageOf([room.product]));
    } else if (path.endsWith("/requests")) {
      payload = envelope("requests", pageOf([room.request]));
    } else if (path.endsWith("/negotiations")) {
      payload = envelope("negotiations", pageOf([room]));
    } else if (path.endsWith("/negotiations/room-1")) {
      payload = envelope("negotiation", room);
    } else if (path.endsWith("/orders")) {
      payload = envelope("orders", pageOf(state.orders[selected]));
    } else if (path.endsWith("/activity")) {
      payload = envelope("activity", pageOf([]));
    } else if (path.endsWith("/agent/prompt")) {
      const body = incoming.postDataJSON();
      payload = envelope("agent_prompt", {
        prompt: `${selected} ${body.mode}: ${body.objective || "Default strategy"}. Check every 20 seconds.`,
        role: selected,
        workspace_id: `${selected}-workspace`,
        poll_interval_seconds: 20,
        mode: body.mode,
      });
    } else if (path.endsWith("/credentials")) {
      payload = envelope("credentials", { items: [] });
    } else if (path.endsWith("/rules")) {
      const current = state.rules[selected];
      if (incoming.method() === "PUT") {
        const body = incoming.postDataJSON();
        state.ruleWrites.push(body);
        current.version += 1;
        current.rules = body.rules;
      }
      payload = envelope("rules", {
        role: selected,
        target: "workspace",
        version: current.version,
        rules: current.rules,
        effective: current.rules,
        versions: { workspace: current.version },
      });
    } else {
      throw new Error(`Unexpected mock API call: ${incoming.method()} ${path}`);
    }
    await route.fulfill({ json: payload });
  });
  return state;
}
