import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { createFormat, Translate } from "../../application/i18n.tsx";
import type { Density } from "../../application/preferences.ts";
import type { ListSelection } from "../../application/shortcuts.ts";
import { PrRow, type PrRowData } from "./PrRow.tsx";

interface PrListProps {
  readonly t: Translate;
  readonly format: ReturnType<typeof createFormat>;
  readonly now: Date;
  readonly density: Density;
  readonly showRepository: boolean;
  /** The list's accessible name, e.g. the section title. */
  readonly label: string;
  readonly rows: readonly PrRowData[];
  /** The selected row (FR-7.3), which may be in another list on the page. */
  readonly selection?: ListSelection | null;
  /** A row got focus (Tab, a click, J/K), so it becomes the selection. */
  readonly onSelect?: (id: string) => void;
}

/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 8;
/** Until the first row is measured. The CSS fixes the real height per density. */
const ESTIMATED_HEIGHT: Record<Density, number> = { comfortable: 64, compact: 48 };

/**
 * A windowed list (FR-5.9): only the rows near the viewport are in the DOM; padding stands
 * in for the rest, so the scrollbar and scroll position stay true. No dependency: every row
 * has the same height (fixed by CSS per density, measured once), so the visible range is
 * plain arithmetic on the list's position in the viewport. Scroll is listened for in the
 * capture phase, so it works whichever ancestor scrolls (the shell's `main`, or the window).
 *
 * Accessibility trade-off: a screen reader sees only the rendered rows, so each carries
 * `aria-setsize`/`aria-posinset` and announces "row 240 of 500". Keyboard focus moving
 * through the rows scrolls them into view, which renders the next ones, so Tab reaches every
 * row. A focused row scrolled far away with the mouse is unmounted and focus falls back to
 * the page, as with any virtualised list. Find-in-page only sees rendered rows; the filter
 * box is the way to search.
 *
 * Selection (FR-7.3) is DOM focus on the row's title link, not `aria-activedescendant`: a
 * list is not a composite widget that may own an active descendant, and a row holds two
 * links, which a listbox option may not. A J/K move to a row outside the window (scrolled
 * away with the mouse) renders the window around it first, then scrolls it into view and
 * focuses it.
 */
export function PrList({
  t,
  format,
  now,
  density,
  showRepository,
  label,
  rows,
  selection = null,
  onSelect,
}: PrListProps) {
  const list = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({
    start: 0,
    end: 2 * OVERSCAN,
    height: ESTIMATED_HEIGHT[density],
  });

  // A J/K move to a row of this list, not yet focused: the row's index. Each move is a new
  // selection object, so a move to the row already selected focuses it again.
  const pin = useRef<number | null>(null);
  const requested = useRef<ListSelection | null>(null);
  useLayoutEffect(() => {
    if (selection?.focus !== true || requested.current === selection) return;
    requested.current = selection;
    const index = rows.findIndex(({ pr }) => pr.id === selection.id);
    if (index !== -1) pin.current = index;
  });

  // Re-measured after every render, so a density, viewport or length change is picked up.
  // It only sets state when the window moved, so it settles after one extra render.
  const update = useRef(() => {});
  useLayoutEffect(() => {
    update.current = () => {
      const element = list.current;
      if (element === null) return;
      const height = element.querySelector("li")?.offsetHeight || ESTIMATED_HEIGHT[density];
      const top = element.getBoundingClientRect().top;
      let start = Math.max(0, Math.floor(-top / height) - OVERSCAN);
      let end = Math.max(start, Math.ceil((window.innerHeight - top) / height) + OVERSCAN);
      const pinned = pin.current;
      if (pinned !== null && (pinned < start || pinned >= end)) {
        start = Math.max(0, pinned - OVERSCAN);
        end = pinned + OVERSCAN + 1;
      }
      setView((prev) =>
        prev.start === start && prev.end === end && prev.height === height
          ? prev
          : { start, end, height },
      );
    };
    update.current();
  });

  // Once the pinned row is rendered: scroll it into view and focus it. The scroll event
  // then moves the window to where the row now is.
  useLayoutEffect(() => {
    const index = pin.current;
    if (index === null) return;
    const item = list.current?.querySelector(`li[aria-posinset="${String(index + 1)}"]`);
    if (item === null || item === undefined) return;
    pin.current = null;
    item.scrollIntoView({ block: "nearest" });
    item.querySelector<HTMLElement>("a.pr-title")?.focus({ preventScroll: true });
  });

  useEffect(() => {
    const onScroll = () => update.current();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (rows.length === 0) return <p className="pr-empty">{t("emptyList")}</p>;

  const { height } = view;
  const start = Math.min(view.start, rows.length);
  const end = Math.min(view.end, rows.length);
  return (
    <ul
      ref={list}
      className="pr-list"
      aria-label={label}
      style={{ paddingTop: start * height, paddingBottom: (rows.length - end) * height }}
    >
      {rows.slice(start, end).map((row, offset) => (
        <li
          key={row.pr.id}
          aria-setsize={rows.length}
          aria-posinset={start + offset + 1}
          data-selected={selection?.id === row.pr.id ? "" : undefined}
          onFocus={onSelect === undefined ? undefined : () => onSelect(row.pr.id)}
        >
          <PrRow
            {...row}
            t={t}
            format={format}
            now={now}
            density={density}
            showRepository={showRepository}
          />
        </li>
      ))}
    </ul>
  );
}
