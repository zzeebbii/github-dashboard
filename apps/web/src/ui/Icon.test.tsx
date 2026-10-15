import { Check } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Icon } from "./Icon.tsx";

test("an icon without a label is decorative and hidden from assistive tech", async () => {
  const screen = await render(<Icon icon={Check} />);

  const svg = screen.container.querySelector("svg");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  expect(svg?.getAttribute("width")).toBe("16");
});

test("a labelled icon is exposed as an image with that name", async () => {
  const screen = await render(<Icon icon={Check} label="Approved" size={20} />);

  await expect.element(screen.getByRole("img", { name: "Approved" })).toBeInTheDocument();
});
