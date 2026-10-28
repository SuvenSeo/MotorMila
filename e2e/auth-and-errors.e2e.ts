import { expect, test } from "./fixtures";

test.describe("sign-in", () => {
  test("renders the form and validates input client-side", async ({ page, pageErrors }) => {
    await page.goto("/sign-in");

    await expect(page).toHaveTitle(/Sign In — Motormila/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password", { exact: true });
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Invalid email")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);

    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });

  test("legacy /login redirects to sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe("not found", () => {
  test("unknown routes render the 404 page with a way home", async ({ page, pageErrors }) => {
    await page.goto("/this-route-does-not-exist");

    await expect(page).toHaveTitle(/Page not found/);
    await expect(page.getByRole("heading", { level: 1, name: /wrong turn/i })).toBeVisible();

    await page.getByRole("link", { name: /^Inventory/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    expect(pageErrors.messages, pageErrors.messages.join("\n")).toEqual([]);
  });
});
