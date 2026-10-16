import { useEffect, useEffectEvent } from "react";

/**
 * Global keyboard shortcuts (FR-7.1), registered once in the shell with `useShortcuts`.
 * T26 adds the list shortcuts (j/k/Enter, …) to the same list.
 *
 * As in GitHub, Slack and Linear: a ⌘/Ctrl shortcut works everywhere, a text field
 * included (typing never produces it); a plain-key shortcut never fires while focus is in
 * a text field, so it cannot swallow what the user types.
 */
export interface Shortcut {
  /** `KeyboardEvent.key`, lower case. */
  readonly key: string;
  /** Needs ⌘ (Apple) or Ctrl (elsewhere); either is accepted on every platform. */
  readonly mod?: boolean;
  readonly run: () => void;
}

type KeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing" | "target"
>;

const TEXT_FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const inTextField = (target: EventTarget | null) =>
  target instanceof Element && target.closest(TEXT_FIELD) !== null;

/** The shortcut `event` triggers, if any. */
export function findShortcut(event: KeyEvent, shortcuts: readonly Shortcut[]): Shortcut | null {
  if (event.isComposing || event.altKey || event.shiftKey) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (!mod && inTextField(event.target)) return null;
  const key = event.key.toLowerCase();
  return shortcuts.find((s) => s.key === key && (s.mod ?? false) === mod) ?? null;
}

/** Listens on `document` for the component's lifetime; `shortcuts` may change every render. */
export function useShortcuts(shortcuts: readonly Shortcut[]): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const shortcut = findShortcut(event, shortcuts);
    if (shortcut === null) return;
    // Ctrl+K would otherwise focus the browser's search bar.
    event.preventDefault();
    shortcut.run();
  });
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere: the hint shown beside a shortcut. */
export function modKeyLabel(key: string): string {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent) ? `⌘${key}` : `Ctrl ${key}`;
}
