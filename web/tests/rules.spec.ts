import { expect, test } from "@playwright/test";
import { mockMarketplace } from "./fixtures/guidance";

test("buyer owner edits private limits; money is sent in cents with the expected version", async ({
  page,
}) => {
  const state = await mockMarketplace(page, "buyer");
  await page.goto("/?view=rules");
  const total = page.getByLabel("Maximum total per deal");
  await expect(total).toHaveValue("1200.00");
  await total.fill("950.50");
  await page.getByLabel("Maximum deposit").fill("25");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "Saved as version 2",
  );
  expect(state.ruleWrites).toEqual([
    {
      expected_version: 1,
      rules: { max_total: 95050, max_deposit_percent: 25 },
    },
  ]);
});

test("seller sees its own rule fields, and non-owners cannot edit", async ({
  page,
}) => {
  const state = await mockMarketplace(page, "seller");
  state.scopes = ["negotiations:read"];
  await page.goto("/?view=rules");
  const floor = page.getByLabel("Minimum unit price");
  await expect(floor).toHaveValue("100.00");
  await expect(floor).toBeDisabled();
  await expect(page.getByLabel("Discount from quantity")).toHaveValue("5");
  await expect(page.getByRole("button", { name: "Save rules" })).toHaveCount(0);
  await expect(
    page.getByText("Only workspace owners can change rules."),
  ).toBeVisible();
  expect(state.ruleWrites).toHaveLength(0);
});
