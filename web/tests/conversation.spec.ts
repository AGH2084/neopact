import { expect, test } from "@playwright/test";
import { mockMarketplace } from "./fixtures/guidance";
import { conversationRoom } from "./fixtures/conversation";

for (const role of ["buyer", "seller"] as const) {
  test(`${role} reads actual shared dialogue, evidence and an exact offer`, async ({
    page,
  }) => {
    const state = await mockMarketplace(page, role);
    state.rooms.buyer = conversationRoom();
    state.rooms.seller = conversationRoom();
    await page.goto("/?view=approvals&room=room-1");
    const conversation = page.getByRole("region", {
      name: "Shared negotiation conversation",
      exact: true,
    });
    await expect(conversation).toContainText(
      "We need eight chairs before the opening",
    );
    await expect(conversation).toContainText(
      "Could you improve the total while keeping that delivery date?",
    );
    await expect(conversation.locator("blockquote")).toContainText(
      "Can you deliver by 24 October?",
    );
    await expect(
      conversation.getByRole("link", { name: "Woven back detail" }),
    ).toHaveAttribute("href", /image-1\/content\?workspace_id=/);
    await expect(
      conversation.getByRole("img", { name: "Woven back detail" }),
    ).toHaveJSProperty("complete", true);
    await expect(
      conversation.getByLabel("Offer version 1").first(),
    ).toContainText("€1,180.00");
    await expect(
      conversation.getByLabel("Offer version 1").first(),
    ).toContainText("€240.00");
    await expect(page.getByRole("dialog")).toContainText(
      "Both agents agreed. Each business must now review and approve this offer.",
    );
    await expect(
      page.getByRole("button", { name: "Approve exact offer" }),
    ).toBeDisabled();
    expect(state.submissions).toHaveLength(0);
  });
}

test("conversation renders hostile text safely inside a mobile dialog", async ({
  page,
}) => {
  const state = await mockMarketplace(page);
  const room = (state.rooms.buyer = conversationRoom());
  room.activity[0]!.data.message =
    "<img src=x onerror=alert('unsafe')> " + "longword".repeat(100);
  room.activity.push({
    id: "owner-1",
    role: "buyer",
    type: "human_requested_negotiation",
    run: 2,
    at: "2026-10-10T09:08:00Z",
    data: { image_ids: [] },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=negotiations&room=room-1");
  const modal = page.getByRole("dialog");
  const conversation = page.getByRole("region", {
    name: "Shared negotiation conversation",
    exact: true,
  });
  await expect(conversation).toContainText(
    "<img src=x onerror=alert('unsafe')>",
  );
  await expect(conversation.locator("img[onerror], script")).toHaveCount(0);
  await expect(conversation.locator("#message-owner-1")).toContainText(
    "buyer workspace",
  );
  await expect(conversation.locator("#message-owner-1")).not.toContainText(
    "buyer agent",
  );
  const bounds = await modal.boundingBox();
  for (const element of await modal
    .locator(".conversation, .conversation-entry, .conversation-offer")
    .all()) {
    const rect = await element.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width,
    );
  }
  expect(await modal.evaluate((element) => element.scrollWidth)).toBe(
    await modal.evaluate((element) => element.clientWidth),
  );
});

test("switching workspaces clears private guidance while retaining shared messages", async ({
  page,
}) => {
  const state = await mockMarketplace(page);
  state.rooms.buyer = conversationRoom();
  state.rooms.seller = conversationRoom();
  state.rooms.buyer.human_guidance = [
    {
      id: "guidance-1",
      role: "buyer",
      instruction: "Private buyer instruction only",
      status: "applied",
      run: 1,
      created_at: "2026-10-10T09:06:00Z",
      applied_at: "2026-10-10T09:07:00Z",
    },
  ];
  await page.goto("/?view=negotiations&room=room-1");
  await expect(page.getByRole("dialog")).toContainText(
    "Private buyer instruction only",
  );
  await page.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("combobox", { name: "Workspace" })
    .selectOption("seller-workspace");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Private buyer instruction",
  );
  await expect(
    page.getByRole("region", {
      name: "Shared negotiation conversation",
      exact: true,
    }),
  ).toContainText("Could you improve the total");
});
