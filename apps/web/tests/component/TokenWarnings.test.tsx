import { expect, test } from "vitest";
import { TokenWarnings } from "../../src/ui/auth/TokenWarnings.tsx";
import { renderWithProviders } from "../render.tsx";

test("renders nothing when there is nothing to warn about", async () => {
  const screen = await renderWithProviders(
    <TokenWarnings
      warnings={[]}
      tokenType="fine-grained"
      missingPermissions={[]}
      ssoAuthorizationNeeded={false}
    />,
  );

  expect(screen.container.textContent).toBe("");
});

test("explains a failed probe, SAML SSO and classic scopes to add", async () => {
  const screen = await renderWithProviders(
    <>
      <TokenWarnings
        warnings={[{ kind: "expires-soon", expiresAt: "2026-10-16T12:00:00.000Z", daysLeft: 1 }]}
        tokenType="classic"
        missingPermissions={null}
        ssoAuthorizationNeeded
      />
      <TokenWarnings
        warnings={[]}
        tokenType="classic"
        missingPermissions={["pull-requests", "org-membership"]}
        ssoAuthorizationNeeded={false}
      />
    </>,
  );

  const [first, second] = screen.getByRole("region", { name: "About this token" }).all();
  await expect.element(first!).toMatchTextContent("expires in 1 day (2026-10-16)");
  await expect.element(first!).toMatchTextContent("permissions could not be checked");
  await expect.element(first!).toMatchTextContent("SAML single sign-on");
  await expect.element(second!).toMatchTextContent("Pull requests: add the “repo” scope");
  await expect
    .element(second!)
    .toMatchTextContent("Organisation membership: add the “read:org” scope");
});
