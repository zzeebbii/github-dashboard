import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { createFormat, Translate } from "../../application/i18n.tsx";
import type { Density } from "../../application/preferences.ts";
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
 */
export function PrList({ t, format, now, density, showRepository, label, rows }: PrListProps) {
  const list = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({
    start: 0,
    end: 2 * OVERSCAN,
    height: ESTIMATED_HEIGHT[density],
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
      const start = Math.max(0, Math.floor(-top / height) - OVERSCAN);
      const end = Math.max(start, Math.ceil((window.innerHeight - top) / height) + OVERSCAN);
      setView((prev) =>
        prev.start === start && prev.end === end && prev.height === height
          ? prev
          : { start, end, height },
      );
    };
    update.current();
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
        <li key={row.pr.id} aria-setsize={rows.length} aria-posinset={start + offset + 1}>
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
