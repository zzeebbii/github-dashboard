import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Keyboard shortcuts: the global ones (FR-7.1), registered in the shell, and the list ones
 * (FR-7.3), registered by a page through `useListShortcuts`. Every `useShortcuts` call adds
 * its list to one registry behind a single `keydown` listener on `document`.
 *
 * As in GitHub, Slack and Linear: a ⌘/Ctrl shortcut works everywhere, a text field
 * included (typing never produces it); a plain-key shortcut never fires while focus is in
 * a text field, so it cannot swallow what the user types, nor while a modal dialog (the PR
 * panel, the palette, a confirmation) is open, so the page underneath stays still.
 */
export interface Shortcut {
  /** `KeyboardEvent.key`, lower case. */
  readonly key: string;
  /** Needs ⌘ (Apple) or Ctrl (elsewhere); either is accepted on every platform. */
  readonly mod?: boolean;
  /** Fires only when this holds for the focused element (the event's target). */
  readonly when?: (target: EventTarget | null) => boolean;
  readonly run: () => void;
}

type KeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing" | "target"
>;

const TEXT_FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const inTextField = (target: EventTarget | null) =>
  target instanceof Element && target.closest(TEXT_FIELD) !== null;

const dialogOpen = (target: EventTarget | null) =>
  target instanceof Node &&
  (target.ownerDocument ?? document).querySelector("dialog[open]") !== null;

/** A printed symbol such as "/" or "?": Shift may be how the layout types it (Shift+7 in fi/sv). */
const isSymbol = (key: string) => key.length === 1 && !/[\p{L}\p{N}]/u.test(key);

/** The shortcut `event` triggers, if any. */
export function findShortcut(event: KeyEvent, shortcuts: readonly Shortcut[]): Shortcut | null {
  const key = event.key.toLowerCase();
  if (event.isComposing || event.altKey || (event.shiftKey && !isSymbol(key))) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (!mod && (inTextField(event.target) || dialogOpen(event.target))) return null;
  return (
    shortcuts.find(
      (s) => s.key === key && (s.mod ?? false) === mod && (s.when?.(event.target) ?? true),
    ) ?? null
  );
}

/** The shortcut lists of every mounted `useShortcuts`, each kept current by its component. */
const registry = new Set<RefObject<readonly Shortcut[]>>();

function onKeyDown(event: KeyboardEvent) {
  for (const shortcuts of registry) {
    const shortcut = findShortcut(event, shortcuts.current);
    if (shortcut !== null) {
      // Ctrl+K would otherwise focus the browser's search bar; "/" its quick find.
      event.preventDefault();
      shortcut.run();
      return;
    }
  }
}

/** Registers `shortcuts` for the component's lifetime; they may change every render. */
export function useShortcuts(shortcuts: readonly Shortcut[]): void {
  const current = useRef(shortcuts);
  useLayoutEffect(() => {
    current.current = shortcuts;
  });
  useEffect(() => {
    if (registry.size === 0) document.addEventListener("keydown", onKeyDown);
    registry.add(current);
    return () => {
      registry.delete(current);
      if (registry.size === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere: the hint shown beside a shortcut. */
export function modKeyLabel(key: string): string {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent) ? `⌘${key}` : `Ctrl ${key}`;
}

/** The row a list shows as selected (FR-7.3). */
export interface ListSelection {
  readonly id: string;
  /** Moved there by J/K: the list scrolls the row into view and focuses its link. */
  readonly focus: boolean;
}

/** Focus is in the page's content (`main`), or nowhere in particular (`body`). */
const inPage = (target: EventTarget | null) =>
  target instanceof Element && (target.matches("body") || target.closest("main") !== null);

/** Focus is on no control at all: Enter on a link or button is the browser's to handle. */
const onNoControl = (target: EventTarget | null) =>
  target instanceof Element && target.matches("body, main");

interface ListShortcutsOptions {
  /** Every row's id, in the order J moves through them. */
  readonly ids: readonly string[];
  /** Opens a row, as a click on its title does. */
  readonly open: (id: string) => void;
  /** J, K and Enter (the Settings toggle, FR-7.3); `/` works either way. */
  readonly enabled: boolean;
  /** The filter box `/` focuses; null on a view without one. */
  readonly filter: RefObject<HTMLInputElement | null>;
}

/**
 * The list shortcuts (FR-7.3): J/K move the selection, Enter opens it, `/` focuses the
 * filter. Only with focus in the page body. Esc is the PR panel's own (ui/Dialog.tsx).
 *
 * The selection follows focus: J focuses the row's title link, and focusing a row any
 * other way (Tab, a click) selects it, so J continues from there. With a link focused,
 * Enter is the link's own; the Enter shortcut covers focus that fell back to the page.
 */
export function useListShortcuts({ ids, open, enabled, filter }: ListShortcutsOptions) {
  const [selection, setSelection] = useState<ListSelection | null>(null);

  function move(delta: 1 | -1) {
    const at = selection === null ? -1 : ids.indexOf(selection.id);
    const next = ids[at === -1 ? 0 : Math.min(Math.max(at + delta, 0), ids.length - 1)];
    if (next !== undefined) setSelection({ id: next, focus: true });
  }

  useShortcuts([
    ...(enabled
      ? [
          { key: "j", when: inPage, run: () => move(1) },
          { key: "k", when: inPage, run: () => move(-1) },
          {
            key: "enter",
            when: (target: EventTarget | null) =>
              onNoControl(target) && selection !== null && ids.includes(selection.id),
            run: () => {
              if (selection !== null) open(selection.id);
            },
          },
        ]
      : []),
    {
      key: "/",
      when: (target) => inPage(target) && filter.current !== null,
      run: () => filter.current?.focus(),
    },
  ]);

  /** A row got focus. Keeps the current object when it is already selected. */
  const select = useCallback((id: string) => {
    setSelection((current) => (current?.id === id ? current : { id, focus: false }));
  }, []);

  return { selection, select };
}
