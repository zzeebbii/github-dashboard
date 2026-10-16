import { expect, test } from "vitest";
import type { ComponentProps } from "react";
import { useT } from "../../src/application/i18n.tsx";
import { TokenWarnings } from "../../src/ui/auth/TokenWarnings.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { renderWithProviders } from "../render.tsx";

/** The component with the active language's `t`, as its callers pass it. */
function Warnings(props: Omit<ComponentProps<typeof TokenWarnings>, "t">) {
  return <TokenWarnings t={useT()} {...props} />;
}

test("renders nothing when there is nothing to warn about", async () => {
  const screen = await renderWithProviders(
    <Warnings
      warnings={[]}
      tokenType="fine-grained"
      missingPermissions={[]}
      ssoAuthorizationNeeded={false}
    />,
  );

  expect(screen.container.textContent).toBe("");
});

test("explains write access, a failed probe, SAML SSO and classic scopes to add", async () => {
  const screen = await renderWithProviders(
    <>
      <Warnings
        warnings={[{ kind: "write-access" }]}
        tokenType="classic"
        missingPermissions={null}
        ssoAuthorizationNeeded
      />
      <Warnings
        warnings={[]}
        tokenType="classic"
        missingPermissions={["pull-requests", "org-membership"]}
        ssoAuthorizationNeeded={false}
      />
    </>,
  );

  const [first, second] = screen.getByRole("region", { name: "About this token" }).all();
  await expect.element(first!).toMatchTextContent("can write to your repositories");
  await expect.element(first!).toMatchTextContent("permissions could not be checked");
  await expect.element(first!).toMatchTextContent("SAML single sign-on");
  await expect.element(second!).toMatchTextContent("Pull requests: add the “repo” scope");
  await expect
    .element(second!)
    .toMatchTextContent("Organisation membership: add the “read:org” scope");
});

test("the warnings have no axe violations in either theme", async () => {
  const screen = await renderWithProviders(
    <Warnings
      warnings={[{ kind: "write-access" }]}
      tokenType="classic"
      missingPermissions={["pull-requests"]}
      ssoAuthorizationNeeded
    />,
  );

  await expectNoAxeViolations(screen.container);
});
