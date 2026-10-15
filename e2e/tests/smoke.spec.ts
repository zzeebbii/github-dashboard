import { expect, test } from "@playwright/test";

/** The prod-like nginx image serves the SPA, including on client-side deep links. */

/** The FR-0.8 reference headers (ADR-0018), for an image built without an exchange URL. */
const securityHeaders = {
  "content-security-policy": `default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types ghd-sanitize`,
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "permissions-policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
};

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

// /, a deep link, and an asset hit different nginx locations; a 404 checks `always`.
for (const path of ["/", "/some/deep/link", "/assets/missing.js"]) {
  test(`${path} carries every security header`, async ({ request }) => {
    const response = await request.get(path);

    expect(response.headers()).toMatchObject(securityHeaders);
  });
}
