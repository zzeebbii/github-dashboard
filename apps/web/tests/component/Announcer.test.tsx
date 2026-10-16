import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { useAnnounce } from "../../src/application/announcer.tsx";
import { renderWithProviders } from "../render.tsx";

function Refresh() {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => {
        announce("Updated just now");
      }}
    >
      Refresh
    </button>
  );
}

test("announce() writes to the one polite live region, a new node each time", async () => {
  const screen = await renderWithProviders(<Refresh />);
  const region = page.getByRole("status");
  await expect.element(region).toHaveAttribute("aria-live", "polite");
  await expect.element(region).toHaveTextContent("");

  await screen.getByRole("button", { name: "Refresh" }).click();
  await expect.element(region).toHaveTextContent("Updated just now");
  const first = region.element().firstElementChild;

  await screen.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => region.element().firstElementChild !== first).toBe(true);
  await expect.element(region).toHaveTextContent("Updated just now");
  expect(page.getByRole("status").all()).toHaveLength(1);
});
