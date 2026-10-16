import axe from "axe-core";
import { expect } from "vitest";

/**
 * Asserts that `container` has no axe violations in BOTH themes (ADR-0021, Definition of Done).
 *
 * The theme is switched by toggling `html.dark` directly, the same class the preferences
 * provider and public/theme-init.js set, so colour-contrast rules see the real tokens. The
 * original class state is restored afterwards.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const root = document.documentElement;
  const wasDark = root.classList.contains("dark");
  // A fade-in still running would be measured half-transparent, so let entrance animations
  // finish first. Endless ones (a spinner) never do and do not affect contrast.
  await Promise.all(
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished),
  );
  try {
    // Sequential on purpose: both runs read the same document, one theme at a time.
    await expectNoViolationsIn(container, false);
    await expectNoViolationsIn(container, true);
  } finally {
    root.classList.toggle("dark", wasDark);
  }
}

async function expectNoViolationsIn(container: Element, dark: boolean): Promise<void> {
  document.documentElement.classList.toggle("dark", dark);
  const { violations } = await axe.run(container);
  const summary = violations.map(
    (v) => `${v.id} (${v.impact ?? "n/a"}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, `axe violations in the ${dark ? "dark" : "light"} theme`).toEqual([]);
}
