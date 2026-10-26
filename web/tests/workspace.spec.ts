import { test, expect } from "@playwright/test";
import type { Order, Product, Room } from "../lib/api";
const password = process.env.DEMO_PASSWORD || "local-market-demo";
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your commerce, in view." }),
  ).toBeVisible();
}
test("buyer and seller review the same offer and approve through the UI", async ({
  page,
  browser,
}) => {
  await login(page, "buyer@demo.local");
  await page.getByRole("button", { name: /^Products$/ }).click();
  await expect(
    page.getByRole("heading", { name: "The product catalogue." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Arc stack chair/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").locator(".gallery-main img"),
  ).toHaveJSProperty("complete", true);
  await page
    .getByRole("button", { name: "Side illustration", exact: true })
    .click();
  await page.getByRole("button", { name: "Close details" }).click();
  const workspaceId = await page.evaluate(() =>
    localStorage.getItem("market_workspace"),
  );
  expect(workspaceId).toBeTruthy();
  const headers = { "X-Workspace-ID": workspaceId! };
  const roomResponse = await page.request.get(
    "/api/v1/negotiations?limit=100",
    { headers },
  );
  expect(roomResponse.status()).toBe(200);
  const { negotiations } = (await roomResponse.json()) as {
    negotiations: { items: Room[] };
  };
  const room = negotiations.items.find(
    (candidate) =>
      candidate.request.title.includes("CLI demonstration") &&
      candidate.state === "awaiting_approval" &&
      candidate.valid &&
      candidate.current_offer?.approvals.length === 0 &&
      (!process.env.DEMO_ROOM_ID || candidate.id === process.env.DEMO_ROOM_ID),
  );
  expect(
    room,
    "Prepare a fresh unapproved deal with backend/scripts/demo_agents.py; optionally set DEMO_ROOM_ID to its room_id",
  ).toBeDefined();
  const target = room!;
  const productResponse = await page.request.get(
    `/api/v1/products/${target.product_id}`,
    { headers },
  );
  expect(productResponse.status()).toBe(200);
  const { product: beforeProduct } = (await productResponse.json()) as {
    product: Product;
  };
  await page.getByRole("button", { name: /^Approvals/ }).click();
  const row = page
    .locator("tbody tr")
    .filter({ hasText: target.request.title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Review" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("€6,880.00");
  await expect(
    modal.getByRole("button", { name: "Approve exact offer" }),
  ).toBeDisabled();
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: "Approve exact offer" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your approval is recorded" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await page.screenshot({
    path: "test-results/buyer-approvals-desktop.png",
    fullPage: true,
  });
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await login(seller, "forma@demo.local");
  await expect(
    seller.getByRole("button", { name: "Requests", exact: true }),
  ).toHaveCount(0);
  // The backend deliberately redacts the buyer's private request title for sellers.
  // Use the immutable room identity so both parties review the same exact offer.
  await seller.goto(`/?view=approvals&room=${target.id}`);
  await expect(seller.getByRole("dialog")).toContainText("€6,880.00");
  const sellerWorkspaceId = await seller.evaluate(() =>
    localStorage.getItem("market_workspace"),
  );
  const sellerRoomResponse = await seller.request.get(
    `/api/v1/negotiations/${target.id}`,
    { headers: { "X-Workspace-ID": sellerWorkspaceId! } },
  );
  expect(sellerRoomResponse.status()).toBe(200);
  const { negotiation: sellerRoom } = (await sellerRoomResponse.json()) as {
    negotiation: Room;
  };
  expect(sellerRoom.current_offer!.id).toBe(target.current_offer!.id);
  await seller.getByRole("dialog").getByRole("checkbox").check();
  await seller.getByRole("button", { name: "Approve exact offer" }).click();
  await expect(
    seller
      .getByRole("status")
      .filter({ hasText: "Your demo order is confirmed" }),
  ).toBeVisible();
  const ordersResponse = await page.request.get("/api/v1/orders?limit=100", {
    headers,
  });
  expect(ordersResponse.status()).toBe(200);
  const { orders } = (await ordersResponse.json()) as {
    orders: { items: Order[] };
  };
  const recorded = orders.items.filter((order) => order.room_id === target.id);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.offer.id).toBe(target.current_offer!.id);
  expect(recorded[0]!.offer.approvals).toHaveLength(2);
  const afterProductResponse = await page.request.get(
    `/api/v1/products/${target.product_id}`,
    { headers },
  );
  expect(afterProductResponse.status()).toBe(200);
  const { product: afterProduct } = (await afterProductResponse.json()) as {
    product: Product;
  };
  expect(afterProduct.stock).toBe(
    beforeProduct.stock - target.current_offer!.terms.quantity,
  );
  await seller.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("€6,880.00");
  await page.getByRole("button", { name: "View order" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Buyer approval");
  await expect(page.getByRole("dialog")).toContainText("Seller approval");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.reload();
  await expect(page.locator("tbody")).toContainText("€6,880.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/orders-mobile.png",
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await sellerContext.close();
});
