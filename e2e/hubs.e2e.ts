import { expect, listingLinks, SEED, test } from "./fixtures";

test.describe("make / model hubs", () => {
  test("model hub renders market data and recent listings", async ({ page, pageErrors }) => {
    await page.goto("/cars/toyota/prius");

    await expect(page).toHaveTitle(/Toyota Prius — Prices & Listings in Sri Lanka/);
    await expect(page.getByRole("heading", { level: 1, name: "Toyota Prius" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Market snapshot" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent listings" })).toBeVisible();
    await expect(listingLinks(page, "Open Toyota Prius").first()).toBeVisible();
    await expect(listingLinks(page, /Open (Honda|Suzuki|Nissan)/)).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("model hub links back to its make hub", async ({ page }) => {
    await page.goto(`/cars/toyota/prius`);
    await page.locator('a[href="/cars/toyota"]').first().click();
    await expect(page).toHaveURL(/\/cars\/toyota$/);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(SEED.prius.make) })).toBeVisible();
  });
});
