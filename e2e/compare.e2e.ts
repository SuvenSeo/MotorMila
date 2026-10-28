import { expect, listingLinks, test } from "./fixtures";

test.describe("compare", () => {
  test("empty state explains how to add cars", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByRole("heading", { level: 1, name: /compare cars side by side/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /no cars selected yet/i })).toBeVisible();
  });

  test("canonical compare link shows both seeded cars side by side", async ({ page, pageErrors }) => {
    await page.goto("/compare/1-vs-12");

    await expect(page).toHaveTitle(/2017 Toyota Prius vs 2018 Toyota Vitz compared/);
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByText("Rs 11,500,000").first()).toBeVisible();
    await expect(table.getByText("Hybrid")).toBeVisible();
    await expect(table.getByText("Petrol")).toBeVisible();

    await page.waitForLoadState("networkidle");
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("pinning from listing detail adds cars to compare", async ({ page }) => {
    // The pin chip lives in the fair-value card, so use two seeded Prius
    // listings (enough comparables for a typical price).
    await page.goto("/");
    await listingLinks(page, "Open Toyota Prius").first().click();
    await expect(page).toHaveURL(/\/listing\/1$/);
    await page.getByRole("button", { name: /add to compare/i }).click();
    await expect(page.getByRole("button", { name: /pinned/i })).toBeVisible();

    await page.goto("/listing/3");
    await expect(page.getByRole("heading", { level: 1, name: /Toyota Prius · 2018/ })).toBeVisible();
    await page.getByRole("button", { name: /add to compare/i }).click();
    await expect(page.getByRole("button", { name: /pinned/i })).toBeVisible();

    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: /no cars selected yet/i })).toHaveCount(0);
    const table = page.getByRole("table");
    await expect(table.getByText("68,000 km")).toBeVisible();
    await expect(table.getByText("45,000 km")).toBeVisible();
  });
});
