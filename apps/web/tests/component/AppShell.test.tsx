import { afterEach, beforeAll, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { renderApp } from "../render.tsx";
import styles from "../../src/styles.css?inline";

// The real stylesheet: the drawer breakpoint and the contrast checks depend on it.
beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(async () => {
  document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

async function renderShell(width: number) {
  await page.viewport(width, 800);
  const { screen, router } = await renderApp("/");
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  return { screen, router };
}

const noHorizontalScroll = () =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth;

for (const width of [320, 1280]) {
  test(`the shell has no axe violations in either theme at ${width} px (AC-1.4)`, async () => {
    const { screen } = await renderShell(width);

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect.element(screen.getByRole("main")).toBeVisible();
    expect(noHorizontalScroll()).toBe(true);
    await expectNoAxeViolations(screen.container);
  });
}

test("at 1280 px the sidebar shows and the header button collapses it", async () => {
  const { screen } = await renderShell(1280);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await expect.element(nav).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Open menu", includeHidden: true }))
    .not.toBeVisible();

  await screen.getByRole("button", { name: "Toggle sidebar" }).click();

  await expect.element(nav).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Toggle sidebar" }))
    .toHaveAttribute("aria-expanded", "false");
});

test("the skip link is the first stop and moves focus to main", async () => {
  const { screen } = await renderShell(1280);

  await userEvent.tab();
  const skip = screen.getByRole("link", { name: "Skip to content" });
  await expect.element(skip).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(screen.getByRole("main")).toHaveFocus();
});

test("below 768 px the drawer traps focus, closes on Esc and returns focus (FR-1.7)", async () => {
  const { screen } = await renderShell(320);
  await expect
    .element(screen.getByRole("navigation", { name: "Main navigation" }))
    .not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Open menu" });

  await trigger.click();

  const drawer = screen.getByRole("dialog", { name: "Main navigation" });
  await expect.element(drawer).toBeVisible();
  await expectNoAxeViolations(screen.container);
  const inDrawer = () => drawer.element().contains(document.activeElement);
  expect(inDrawer()).toBe(true);
  // More presses than the drawer has stops: focus never reaches the page behind it.
  for (let press = 0; press < 8; press += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- reason: each Tab starts from where the last one left focus
    await userEvent.tab();
    expect(document.activeElement === document.body || inDrawer()).toBe(true);
  }

  await userEvent.keyboard("{Escape}");

  await expect.element(drawer).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test("following a link in the drawer closes it", async () => {
  const { screen, router } = await renderShell(320);
  await screen.getByRole("button", { name: "Open menu" }).click();

  await screen.getByRole("dialog").getByRole("link", { name: "Settings" }).click();

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/settings");
});

test("the theme toggle flips light and dark", async () => {
  const preferencesStore = createInMemoryPreferencesStore();
  await page.viewport(1280, 800);
  const { screen } = await renderApp("/", { preferencesStore });

  await screen.getByRole("button", { name: "Switch to dark theme" }).click();

  await expect.element(screen.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(preferencesStore.load().theme).toBe("dark");
});

test("the sidebar language picker translates the shell", async () => {
  const { screen } = await renderShell(1280);

  await screen.getByRole("combobox", { name: "Language" }).selectOptions("Svenska");

  await expect.element(screen.getByRole("link", { name: "Inställningar" })).toBeVisible();
  expect(document.documentElement.lang).toBe("sv");
});

test("breadcrumbs mark the current page", async () => {
  await page.viewport(1280, 800);
  const { screen } = await renderApp("/repo/octo/app/pull/7");
  const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });

  await expect.element(crumbs.getByRole("link", { name: "octo/app" })).toBeVisible();
  await expect.element(crumbs.getByText("#7")).toHaveAttribute("aria-current", "page");
  await expectNoAxeViolations(screen.container);
});

// CI's pointer can rest on a header button, so axe must also pass in its hover state.
test("the header search button keeps its contrast while hovered", async () => {
  const { screen } = await renderShell(1280);
  const trigger = screen.getByRole("button", { name: /search/i });
  await userEvent.hover(trigger);

  await expectNoAxeViolations(document.body);
});
