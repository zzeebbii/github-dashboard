import { describe, expect, test } from "vitest";
import { findShortcut, type Shortcut } from "./shortcuts.ts";

const palette: Shortcut = { key: "k", mod: true, run: () => undefined };
const next: Shortcut = { key: "j", run: () => undefined };
const shortcuts = [palette, next];

const press = (
  key: string,
  init: Partial<KeyboardEvent> = {},
  target: Element = document.body,
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  target,
  ...init,
});

describe("findShortcut", () => {
  const input = document.createElement("input");

  test("⌘K and Ctrl+K both open the palette, also from a text field", () => {
    expect(findShortcut(press("k", { metaKey: true }), shortcuts)).toBe(palette);
    expect(findShortcut(press("K", { ctrlKey: true }), shortcuts)).toBe(palette);
    expect(findShortcut(press("k", { metaKey: true }, input), shortcuts)).toBe(palette);
  });

  test("a plain key fires outside text fields only", () => {
    expect(findShortcut(press("j"), shortcuts)).toBe(next);
    expect(findShortcut(press("j", {}, input), shortcuts)).toBeNull();
  });

  test("other modifiers, a missing modifier or IME composition match nothing", () => {
    expect(findShortcut(press("k"), shortcuts)).toBeNull();
    expect(findShortcut(press("k", { metaKey: true, shiftKey: true }), shortcuts)).toBeNull();
    expect(findShortcut(press("k", { ctrlKey: true, altKey: true }), shortcuts)).toBeNull();
    expect(findShortcut(press("j", { ctrlKey: true }), shortcuts)).toBeNull();
    expect(findShortcut(press("k", { metaKey: true, isComposing: true }), shortcuts)).toBeNull();
  });
});
