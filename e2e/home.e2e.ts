import { expect, listingLinks, SEED, test } from "./fixtures";

test.describe("home / browse", () => {
  test("loads with seeded inventory and no runtime errors", async ({ page, pageErrors }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Motormila/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();

    // The listing count and cards come from the seeded backend, not snapshots.
    await expect(page.getByText(`${SEED.total} listings`, { exact: true })).toBeVisible();
    await expect(listingLinks(page, "Open Toyota Prius").first()).toBeVisible();
    await expect(page.getByText("Rs 11.5 Mn").first()).toBeVisible();

    await page.waitForLoadState("networkidle");
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("search narrows the feed to the matching model", async ({ page, pageErrors }) => {
    await page.goto("/");
    await expect(listingLinks(page, "Open Toyota Prius").first()).toBeVisible();

    const search = page.getByRole("textbox", { name: "Search listings" });
    await search.fill(SEED.wagonR.model);
    await search.press("Enter");

    await expect(page).toHaveURL(/make=Suzuki/);
    await expect(page).toHaveURL(/model=Wagon\+R/);
    await expect(listingLinks(page, "Open Suzuki Wagon R")).toHaveCount(SEED.wagonR.count);
    await expect(listingLinks(page, "Open Toyota Prius")).toHaveCount(0);
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("make/model deep link filters the feed", async ({ page }) => {
    await page.goto("/?make=Honda&model=Vezel");
    await expect(listingLinks(page, "Open Honda Vezel")).toHaveCount(SEED.vezel.count);
    await expect(listingLinks(page, "Open Toyota Prius")).toHaveCount(0);
  });
});
