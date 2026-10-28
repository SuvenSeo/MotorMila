import { expect, listingLinks, test } from "./fixtures";

test.describe("listing detail", () => {
  test("opens from the feed and shows price + fair-value section", async ({ page, pageErrors }) => {
    await page.goto("/");
    await listingLinks(page, "Open Toyota Prius").first().click();

    await expect(page).toHaveURL(/\/listing\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: /Toyota Prius/ })).toBeVisible();
    await expect(page).toHaveTitle(/Toyota Prius \d{4} — Motormila/);

    // Asking price block.
    await expect(page.getByText(/asking price/i).first()).toBeVisible();
    await expect(page.getByText(/^Rs \d{1,3}(,\d{3})+$/).first()).toBeVisible();

    // Fair-value (typical asking price) section, backed by the seeded comps.
    await expect(page.getByRole("heading", { name: "Typical asking price" })).toBeVisible();
    await expect(page.getByText(/\d+ comparable listings/)).toBeVisible();
    await expect(page.getByText(/not enough comparable listings/i)).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("direct link renders the seeded listing", async ({ page }) => {
    await page.goto("/listing/1");
    await expect(page.getByRole("heading", { level: 1, name: /Toyota Prius · 2017/ })).toBeVisible();
    await expect(page.getByText("Rs 11,500,000").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Key specs" })).toBeVisible();
  });
});
