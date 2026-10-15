import { expect, test } from "@playwright/test";

/** The prod-like nginx image serves the SPA, including on client-side deep links. */

test("the home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("GitHub Dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "GitHub Dashboard" })).toBeVisible();
});

test("a deep link returns the SPA shell", async ({ page }) => {
  const response = await page.goto("/some/path");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("GitHub Dashboard");
});
