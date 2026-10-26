import { expect, test, type Route } from "@playwright/test";
import { mockMarketplace } from "./fixtures/guidance";

async function promptResponse(
  route: Route,
  overrides: Record<string, unknown> = {},
) {
  const role =
    route.request().headers()["x-workspace-id"] === "seller-workspace"
      ? "seller"
      : "buyer";
  const input = route.request().postDataJSON();
  await route.fulfill({
    json: {
      agent_prompt: {
        prompt: `${role} ${input.mode}: ${input.objective || "Default strategy"}. Check every 20 seconds.`,
        role,
        workspace_id: `${role}-workspace`,
        poll_interval_seconds: 20,
        mode: input.mode,
        ...overrides,
      },
      status_code: 200,
    },
  });
}

for (const role of ["buyer", "seller"] as const) {
  test(`${role} prepares a workspace-scoped prompt and clears stale text after editing`, async ({
    page,
  }) => {
    await mockMarketplace(page, role);
    const bodies: unknown[] = [];
    await page.route("**/api/v1/agent/prompt", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["x-workspace-id"]).toBe(
        `${role}-workspace`,
      );
      expect(route.request().headers()).not.toHaveProperty("authorization");
      bodies.push(route.request().postDataJSON());
      await promptResponse(route);
    });
    if (role === "seller")
      await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=connections");
    const panel = page.getByRole("region", { name: "Set up your negotiator" });
    await expect(
      panel.getByLabel("Negotiation prompt", { exact: true }),
    ).toHaveValue(`${role} start: Default strategy. Check every 20 seconds.`);
    await expect(
      panel.getByRole("button", { name: "Copy negotiation prompt" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("default-negotiator.png"),
      fullPage: true,
    });
    await expect(panel).toContainText(
      role === "buyer" ? "Buyer · Chair buyer" : "Seller · Chair seller",
    );
    await expect(page.getByLabel("Allow agent trading")).not.toBeChecked();
    await expect(panel).toContainText("every 20 seconds");
    await expect(panel).toContainText("Both humans still approve");
    const objective = panel.getByLabel("What should your agent achieve?");
    await expect(objective).toHaveValue("");
    await expect(objective).toHaveAttribute(
      "placeholder",
      role === "buyer" ? /total cost/ : /highest feasible price/,
    );
    await expect(panel.locator('option[value="request"]')).toHaveCount(
      role === "buyer" ? 1 : 0,
    );
    await objective.fill(
      "  Prioritize a smaller deposit and keep my requirements.  ",
    );
    await panel.getByLabel("Where to work").selectOption("room");
    await expect(
      panel.getByRole("button", { name: "Generate negotiation prompt" }),
    ).toBeDisabled();
    await panel.getByLabel("Negotiation ID", { exact: true }).fill("room-1");
    await panel
      .getByRole("button", { name: "Generate negotiation prompt" })
      .click();
    await expect(
      panel.getByLabel("Negotiation prompt", { exact: true }),
    ).toHaveValue(new RegExp(`${role} start:`));
    expect(
      bodies.filter((body) => (body as { objective: string }).objective),
    ).toEqual([
      {
        objective: "Prioritize a smaller deposit and keep my requirements.",
        mode: "start",
        room_id: "room-1",
        request_id: null,
      },
    ]);
    await expect(
      panel.getByRole("button", { name: "Copy negotiation prompt" }),
    ).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth)).toBe(
      await panel.evaluate((element) => element.clientWidth),
    );
    await page.screenshot({
      path: test.info().outputPath("negotiator.png"),
      fullPage: true,
    });
    await objective.fill("An updated objective");
    await expect(
      panel.getByLabel("Negotiation prompt", { exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Copy negotiation prompt" }),
    ).toHaveCount(0);
  });
}

test("buyer resume targets a request, and unavailable clipboard selects only the prompt for manual copy", async ({
  page,
}) => {
  await mockMarketplace(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = () => false;
  });
  await page.route("**/api/v1/agent/prompt", async (route) => {
    if (route.request().postDataJSON().mode === "resume")
      expect(route.request().postDataJSON()).toEqual({
        objective: "",
        mode: "resume",
        room_id: null,
        request_id: "request-1",
      });
    await promptResponse(route);
  });
  await page.goto("/?view=connections");
  const panel = page.getByRole("region", { name: "Set up your negotiator" });
  await panel.getByLabel("Agent task").selectOption("resume");
  await panel.getByLabel("Where to work").selectOption("request");
  await panel.getByLabel("Purchase request ID").fill("request-1");
  await panel.getByRole("button", { name: "Generate resume prompt" }).click();
  await panel.getByRole("button", { name: "Copy resume prompt" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Clipboard access is unavailable",
  );
  const preview = panel.getByLabel("Resume prompt", { exact: true });
  await expect(preview).toBeFocused();
  expect(
    await preview.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe(await preview.inputValue());
  await expect(
    panel.getByRole("button", { name: "Prompt copied", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Select prompt text" }).click();
  await expect(panel.getByRole("status")).toContainText("Prompt selected");
});

for (const method of ["clipboard", "selection"] as const) {
  test(`${method} copy success copies only the prompt while the separate private MCP configuration is visible`, async ({
    page,
  }) => {
    await mockMarketplace(page);
    await page.addInitScript((copyMethod) => {
      Object.defineProperty(navigator, "clipboard", {
        value:
          copyMethod === "selection"
            ? undefined
            : {
                writeText: async (value: string) => {
                  (window as unknown as { copiedPrompt: string }).copiedPrompt =
                    value;
                },
              },
        configurable: true,
      });
      document.execCommand = (command) => {
        const selected = document.activeElement;
        if (
          copyMethod !== "selection" ||
          command !== "copy" ||
          !(selected instanceof HTMLTextAreaElement) ||
          selected.id !== "negotiator-preview"
        )
          return false;
        (window as unknown as { copiedPrompt: string }).copiedPrompt =
          selected.value.slice(selected.selectionStart, selected.selectionEnd);
        return true;
      };
    }, method);
    await page.route("**/api/v1/credentials", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: { credentials: { items: [] }, status_code: 200 },
        });
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          credential: {
            id: "credential-1",
            name: body.name,
            workspace_id: "buyer-workspace",
            role: "buyer",
            scopes: body.scopes,
            token: "secret-test-token-never-copy-to-prompt",
            expires_at: "2030-10-17T00:00:00Z",
          },
          status_code: 201,
        },
      });
    });
    await page.route("**/api/v1/agent/prompt", (route) =>
      promptResponse(route),
    );
    await page.goto("/?view=connections");
    await page.getByLabel("Allow agent trading").check();
    await page
      .getByRole("button", { name: "Create connection", exact: true })
      .click();
    await expect(page.getByLabel("Private workspace token")).toBeVisible();
    await page.getByText("Other MCP clients (HTTP)", { exact: true }).click();
    await expect(
      page.getByLabel("Private HTTP MCP configuration"),
    ).toBeVisible();
    await expect(page.getByLabel("Private HTTP MCP configuration")).toHaveValue(
      /secret-test-token/,
    );
    const panel = page.getByRole("region", { name: "Set up your negotiator" });
    await expect(
      panel.getByLabel("Negotiation prompt", { exact: true }),
    ).toHaveValue(/Default strategy/);
    await panel
      .getByRole("button", { name: "Copy negotiation prompt" })
      .click();
    await expect(panel.getByRole("status")).toContainText("Prompt copied");
    await expect(panel.getByRole("status")).toContainText(
      "No agent has been started by this page",
    );
    const copied = await page.evaluate(
      () => (window as unknown as { copiedPrompt: string }).copiedPrompt,
    );
    expect(copied).toBe(
      await panel
        .getByLabel("Negotiation prompt", { exact: true })
        .inputValue(),
    );
    expect(copied).not.toContain("secret-test-token");
    expect(copied).not.toContain("NEOPACT_MCP_TOKEN");
    expect(copied).not.toContain("mcpServers");
    expect(copied).not.toContain("Authorization");
  });
}

test("generation failures preserve the objective and retry without exposing a stale preview", async ({
  page,
}) => {
  await mockMarketplace(page);
  let fail = true;
  await page.route("**/api/v1/agent/prompt", async (route) => {
    if (!fail) return promptResponse(route);
    await route.fulfill({
      status: 404,
      json: {
        error: {
          code: "not_found",
          message: "Negotiation not found in this workspace.",
          details: null,
        },
        status_code: 404,
      },
    });
  });
  await page.goto("/?view=connections");
  const panel = page.getByRole("region", { name: "Set up your negotiator" });
  await panel
    .getByLabel("What should your agent achieve?")
    .fill("Keep this objective.");
  await panel
    .getByRole("button", { name: "Generate negotiation prompt" })
    .click();
  await expect(panel.getByRole("alert")).toHaveText(
    "Negotiation not found in this workspace.",
  );
  await expect(panel.getByLabel("What should your agent achieve?")).toHaveValue(
    "Keep this objective.",
  );
  await expect(
    panel.getByLabel("Negotiation prompt", { exact: true }),
  ).toHaveCount(0);
  fail = false;
  await panel
    .getByRole("button", { name: "Generate negotiation prompt" })
    .click();
  await expect(
    panel.getByLabel("Negotiation prompt", { exact: true }),
  ).toHaveValue(/Keep this objective/);
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("late responses cannot restore a prompt after its inputs change", async ({
  page,
}) => {
  await mockMarketplace(page);
  let pending: Route | undefined;
  await page.route("**/api/v1/agent/prompt", (route) => {
    if (!route.request().postDataJSON().objective) return promptResponse(route);
    pending = route;
  });
  await page.goto("/?view=connections");
  const panel = page.getByRole("region", { name: "Set up your negotiator" });
  await panel
    .getByLabel("What should your agent achieve?")
    .fill("Old objective");
  await panel
    .getByRole("button", { name: "Generate negotiation prompt" })
    .click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await panel
    .getByLabel("What should your agent achieve?")
    .fill("New objective");
  const received = page.waitForResponse("**/api/v1/agent/prompt");
  await promptResponse(pending!);
  await received;
  await expect(
    panel.getByLabel("Negotiation prompt", { exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Generate negotiation prompt" }),
  ).toBeEnabled();
});

test("workspace switch clears the objective and ignores a pending prompt from the previous side", async ({
  page,
}) => {
  await mockMarketplace(page);
  let pending: Route | undefined;
  await page.route("**/api/v1/agent/prompt", (route) => {
    if (!route.request().postDataJSON().objective) return promptResponse(route);
    pending = route;
  });
  await page.goto("/?view=connections");
  const panel = page.getByRole("region", { name: "Set up your negotiator" });
  await panel
    .getByLabel("What should your agent achieve?")
    .fill("Private buyer objective");
  await panel
    .getByRole("button", { name: "Generate negotiation prompt" })
    .click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page
    .getByLabel("Workspace", { exact: true })
    .selectOption("seller-workspace");
  await expect(panel).toContainText("Seller · Chair seller");
  const received = page.waitForResponse("**/api/v1/agent/prompt");
  await promptResponse(pending!);
  await received;
  await expect(panel.getByLabel("What should your agent achieve?")).toHaveValue(
    "",
  );
  await expect(
    panel.getByLabel("Negotiation prompt", { exact: true }),
  ).toHaveValue("seller start: Default strategy. Check every 20 seconds.");
  await expect(panel).not.toContainText("Private buyer objective");
});

test("a response for the wrong workspace is not displayed or copied", async ({
  page,
}) => {
  await mockMarketplace(page);
  await page.route("**/api/v1/agent/prompt", (route) =>
    promptResponse(route, { role: "seller", workspace_id: "seller-workspace" }),
  );
  await page.goto("/?view=connections");
  const panel = page.getByRole("region", { name: "Set up your negotiator" });
  await expect(panel.getByRole("alert")).toContainText(
    "did not match this workspace",
  );
  await expect(
    panel.getByLabel("Negotiation prompt", { exact: true }),
  ).toHaveCount(0);
});
