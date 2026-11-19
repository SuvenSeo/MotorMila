import { expect, test } from "@playwright/test";

const poster = (page: import("@playwright/test").Page) => page.getByRole("contentinfo").last();

test("the poster footer carries the site on every route", async ({ page }) => {
  await page.goto("/");
  const footer = poster(page);
  await expect(footer.getByRole("button", { name: "Pull the pin" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Motormila", exact: true }).locator("img"))
    .toHaveAttribute("src", "/logo-wordmark-dark.svg");
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(footer.locator("input[type=email]")).toHaveCount(0);

  await page.goto("/pricing");
  await expect(poster(page).getByRole("button", { name: "Pull the pin" })).toBeVisible();
});

test("the pin tears the sheet and the poster navigates inside the app", async ({ page }) => {
  await page.goto("/");
  const footer = poster(page);
  const trends = footer.getByRole("link", { name: "Trends", exact: true });
  await trends.scrollIntoViewIfNeeded();
  await expect(trends).toBeInViewport();
  await expect(footer).toHaveCSS("color-scheme", "dark");

  const pin = footer.getByRole("button", { name: "Pull the pin" });
  const edge = footer.locator(".tpf-rim");
  await expect(pin).toBeEnabled();
  await expect(edge).toHaveAttribute("d", /^M/);
  const originalEdge = await edge.getAttribute("d");
  await pin.click();
  await expect(pin).toBeEnabled();
  await expect(edge).not.toHaveAttribute("d", originalEdge!);

  const documentStart = await page.evaluate(() => performance.timeOrigin);
  await trends.click();
  await expect(page).toHaveURL(/\/trends$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
});

test("on a narrow phone, the pin redraws without motion and the footer links stay available", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const footer = poster(page);
  const pin = footer.getByRole("button", { name: "Pull the pin" });
  const edge = footer.locator(".tpf-rim");
  await pin.scrollIntoViewIfNeeded();
  await expect(pin).toBeInViewport();
  await expect(edge).toHaveAttribute("d", /^M/);
  const before = await edge.getAttribute("d");

  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(edge).not.toHaveAttribute("d", before!);
  await expect(footer.getByRole("link", { name: "Best Picks", exact: true })).toBeVisible();
  await expect(footer.getByRole("link", { name: "EV Hub", exact: true })).toBeVisible();
  expect(await footer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await footer.getByRole("button", { name: "Back to top" }).first().click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
