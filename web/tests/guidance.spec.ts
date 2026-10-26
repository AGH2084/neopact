import { expect, test } from "@playwright/test";
import { mockMarketplace } from "./fixtures/guidance";

for (const role of ["buyer", "seller"] as const) {
  test(`${role} composer controls stay inside the dialog on a narrow screen`, async ({
    page,
  }) => {
    await mockMarketplace(page, role);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=approvals&room=room-1");
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "Negotiate more" }).click();
    await modal
      .getByRole("textbox", { name: "Tell your agent what to try" })
      .fill("Keep my delivery date while trying a better price.");
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    for (const control of await modal
      .locator(".guidance-box textarea, .guidance-box button")
      .all()) {
      const controlBounds = await control.boundingBox();
      expect(
        controlBounds,
        (await control.textContent()) || "textarea",
      ).not.toBeNull();
      expect(controlBounds!.x).toBeGreaterThanOrEqual(bounds!.x + 16);
      expect(controlBounds!.x + controlBounds!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width - 16,
      );
    }
    expect(await modal.evaluate((element) => element.scrollWidth)).toBe(
      await modal.evaluate((element) => element.clientWidth),
    );
  });

  test(`${role} can privately request a new negotiation and see its progress`, async ({
    page,
  }) => {
    // HTTP LAN origins lack randomUUID, but still expose getRandomValues.
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: undefined,
        configurable: true,
      });
    });
    const state = await mockMarketplace(page, role);
    await page.clock.install();
    await page.goto("/?view=approvals&room=room-1");
    const modal = page.getByRole("dialog");
    await modal.getByRole("checkbox").check();
    await modal.getByRole("button", { name: "Negotiate more" }).click();
    const send = modal.getByRole("button", { name: "Send to my agent" });
    const draft = modal.getByRole("textbox", {
      name: "Tell your agent what to try",
    });
    await expect(send).toBeDisabled();
    await draft.fill(" ");
    await expect(send).toBeDisabled();
    await draft.fill("x".repeat(2001));
    await expect(send).toBeDisabled();
    await expect(modal).toContainText("2,001 / 2,000 characters");
    await modal
      .getByRole("button", {
        name:
          role === "buyer"
            ? "Try to lower the total while keeping the quantity and delivery date."
            : "Try for a higher price using the product's documented value.",
        exact: true,
      })
      .click();
    await expect(draft).toHaveValue(
      role === "buyer" ? /lower the total/ : /higher price/,
    );
    await draft.fill(
      "  Try my private tactic <script>alert('private')</script>  ",
    );
    await expect(modal).toContainText("clears both approvals");
    await expect(modal).toContainText(
      "Your agent must be connected to read this message",
    );
    await send.click();
    await expect(modal.getByRole("status")).toHaveText(
      "Instruction sent privately.",
    );
    expect(state.submissions).toHaveLength(1);
    expect(state.submissions[0]!.body).toEqual({
      instruction: "Try my private tactic <script>alert('private')</script>",
      expected_version: 7,
    });
    expect(state.submissions[0]!.key).toMatch(/^[a-f0-9-]{36}$/);
    await expect(modal).toContainText("Sent · waiting for your agent");
    await expect(modal.locator(".guidance-history script")).toHaveCount(0);
    await expect(
      modal.getByRole("button", { name: "Approve exact offer" }),
    ).toHaveCount(0);
    const room = state.rooms[role];
    room.human_guidance[0]!.status = "applied";
    room.human_guidance[0]!.applied_at = "2026-10-10T09:05:00Z";
    room.version++;
    room.state = "awaiting_approval";
    room.valid = true;
    room.invalid_reasons = [];
    await page.clock.runFor(5000);
    await expect(modal).toContainText("Handled by your agent");
    await expect(modal.getByRole("checkbox")).not.toBeChecked();
    await expect(
      modal.getByRole("button", { name: "Approve exact offer" }),
    ).toBeDisabled();
  });
}

test("a stale version refreshes terms, preserves the draft, and requires another explicit send", async ({
  page,
}) => {
  const state = await mockMarketplace(page);
  state.handler = async (route) => {
    state.rooms.buyer.version = 8;
    state.rooms.buyer.current_offer!.terms.total = 119000;
    state.handler = null;
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: "stale_version",
          message: "Refresh before sending guidance",
          details: null,
        },
        status_code: 409,
      },
    });
  };
  await page.goto("/?view=negotiations&room=room-1");
  await page.getByRole("button", { name: "Negotiate more" }).click();
  const draft = page.getByRole("textbox", {
    name: "Tell your agent what to try",
  });
  await draft.fill("Keep my private draft after a concurrent offer.");
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Review the updated terms and send again",
  );
  await expect(draft).toHaveValue(
    "Keep my private draft after a concurrent offer.",
  );
  await expect(page.getByRole("dialog")).toContainText("€1,190.00");
  expect(state.submissions).toHaveLength(1);
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Instruction sent privately.",
  );
  expect(state.submissions[1]!.body.expected_version).toBe(8);
  expect(state.submissions[1]!.key).not.toBe(state.submissions[0]!.key);
});

test("network retries preserve the exact key and payload despite a newer polled room", async ({
  page,
}) => {
  const state = await mockMarketplace(page);
  await page.clock.install();
  state.handler = async (route) => {
    if (state.submissions.length === 1) {
      state.rooms.buyer.version = 8;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "backend_unavailable",
            message: "Please retry.",
            details: null,
          },
          status_code: 503,
        },
      });
    } else {
      await route.fulfill({
        json: { negotiation: state.rooms.buyer, status_code: 200 },
      });
    }
  };
  await page.goto("/?view=negotiations&room=room-1");
  await page.getByRole("button", { name: "Negotiate more" }).click();
  await page
    .getByRole("textbox", { name: "Tell your agent what to try" })
    .fill("Try a lower deposit.");
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Please retry.",
  );
  await page.clock.runFor(5000);
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Instruction sent privately.",
  );
  expect(state.submissions).toHaveLength(2);
  expect(state.submissions[1]).toEqual(state.submissions[0]);
});

for (const stateName of ["ordered", "cancelled"] as const) {
  test(`${stateName} rooms do not offer further negotiation`, async ({
    page,
  }) => {
    const state = await mockMarketplace(page);
    state.rooms.buyer.state = stateName;
    state.rooms.buyer.can_request_guidance = false;
    await page.goto("/?view=negotiations&room=room-1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Negotiate more" }),
    ).toHaveCount(0);
  });
}

test("late guidance responses and private drafts cannot cross a workspace switch", async ({
  page,
}) => {
  const state = await mockMarketplace(page);
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.handler = async (route, body) => {
    await response;
    const room = state.rooms.buyer;
    room.human_guidance = [
      {
        id: "private-buyer",
        role: "buyer",
        instruction: body.instruction,
        status: "pending",
        run: 2,
        created_at: "2026-10-10T09:00:00Z",
        applied_at: null,
      },
    ];
    await route.fulfill({ json: { negotiation: room, status_code: 200 } });
  };
  await page.goto("/?view=negotiations&room=room-1");
  await page.getByRole("button", { name: "Negotiate more" }).click();
  await page
    .getByRole("textbox", { name: "Tell your agent what to try" })
    .fill("Private buyer strategy that must never cross workspaces.");
  await page.getByRole("button", { name: "Send to my agent" }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Approve exact offer" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("combobox", { name: "Workspace" })
    .selectOption("seller-workspace");
  await expect(
    page.getByText("seller workspace", { exact: true }),
  ).toBeVisible();
  release();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Negotiate more" }).click();
  await expect(
    page.getByRole("textbox", { name: "Tell your agent what to try" }),
  ).toBeEmpty();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Private buyer strategy",
  );
  expect(state.submissions).toHaveLength(1);
});
