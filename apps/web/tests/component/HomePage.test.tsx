import { expect, test } from "vitest";
import { expectNoAxeViolations } from "../axe.ts";
import { renderApp } from "../render.tsx";

test("Home shows the app heading inside the shell's main landmark", async () => {
  const { screen } = await renderApp("/");

  await expect
    .element(screen.getByRole("main").getByRole("heading", { level: 1, name: "GitHub Dashboard" }))
    .toBeInTheDocument();
});

test("Home has no axe violations in either theme", async () => {
  const { screen } = await renderApp("/");
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

  await expectNoAxeViolations(screen.container);
});
