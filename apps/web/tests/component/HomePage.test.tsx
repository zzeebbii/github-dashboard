import { expect, test } from "vitest";
import { HomePage } from "../../src/features/home/HomePage.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { renderWithProviders } from "../render.tsx";

test("HomePage shows the app heading inside the main landmark", async () => {
  const screen = await renderWithProviders(<HomePage />);

  await expect
    .element(screen.getByRole("main").getByRole("heading", { level: 1, name: "GitHub Dashboard" }))
    .toBeInTheDocument();
});

test("HomePage has no axe violations in either theme", async () => {
  const screen = await renderWithProviders(<HomePage />);

  await expectNoAxeViolations(screen.container);
});
