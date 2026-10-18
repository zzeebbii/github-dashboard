import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";

interface SplitterProps {
  /** The handle's accessible name, e.g. "Resize sidebar". */
  readonly label: string;
  /** The id of the pane it resizes. Its rendered width is the splitter's value. */
  readonly controls: string;
  /** The narrowest the pane may be, in px. */
  readonly min: number;
  /** The widest the pane may be at this viewport width, in px. Must match the CSS clamp. */
  readonly max: (viewportWidth: number) => number;
  /**
   * The pane edge the handle sits on: on the right, dragging right widens the pane (the
   * sidebar); on the left, dragging left does (the PR panel).
   */
  readonly edge: "left" | "right";
  /** Every change, live during a drag: apply it. null is the default width. */
  readonly onResize: (width: number | null) => void;
  /** A change is finished (pointer up, a key, a reset): persist it. */
  readonly onCommit: (width: number | null) => void;
  readonly className?: string;
}

const STEP = 16;
const BIG_STEP = 64;

/**
 * A window splitter (WAI-ARIA APG): a focusable `separator` whose value is the controlled
 * pane's width in px.
 *
 * - Arrow keys resize by 16 px, with Shift by 64 px; Home and End go to the bounds; Enter
 *   or a double-click resets to the default.
 * - Pointer events with pointer capture, so a mouse, a finger or a pen can drag it.
 *
 * The width itself is applied by the caller (`onResize`), as a CSS custom property that the
 * stylesheet clamps to the same bounds; the value shown is the pane's rendered width,
 * measured, so it stays true when the viewport shrinks the pane.
 */
export function Splitter({
  label,
  controls,
  min,
  max,
  edge,
  onResize,
  onCommit,
  className,
}: SplitterProps) {
  const [size, setSize] = useState({ width: min, viewport: 0 });
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);

  useLayoutEffect(() => {
    const pane = document.getElementById(controls);
    if (pane === null) return undefined;
    const measure = () => {
      const width = Math.round(pane.getBoundingClientRect().width);
      const viewport = window.innerWidth;
      setSize((prev) =>
        prev.width === width && prev.viewport === viewport ? prev : { width, viewport },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [controls]);

  const upper = Math.max(min, Math.floor(max(size.viewport)));
  const clamp = (width: number) => Math.round(Math.min(Math.max(width, min), upper));
  const set = (width: number | null) => {
    onResize(width);
    onCommit(width);
  };
  // Read now, not from state: a held arrow key repeats faster than ResizeObserver reports.
  const current = () =>
    Math.round(document.getElementById(controls)?.getBoundingClientRect().width ?? size.width);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const grow = edge === "right" ? 1 : -1;
    const keys: Record<string, () => void> = {
      ArrowRight: () => set(clamp(current() + step * grow)),
      ArrowLeft: () => set(clamp(current() - step * grow)),
      Home: () => set(min),
      End: () => set(upper),
      Enter: () => set(null),
    };
    const action = keys[event.key];
    if (action === undefined) return;
    event.preventDefault();
    action();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Not prevented: the browser focuses the handle as a pointer focus, with no keyboard
    // ring. `user-select: none` (styles.css) keeps the drag from selecting text.
    event.currentTarget.setPointerCapture(event.pointerId);
    const width = current();
    drag.current = { x: event.clientX, width, last: width };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start === null) return;
    const delta = (event.clientX - start.x) * (edge === "right" ? 1 : -1);
    start.last = clamp(start.width + delta);
    onResize(start.last);
  }

  function onPointerEnd() {
    const start = drag.current;
    if (start === null) return;
    drag.current = null;
    if (start.last !== start.width) onCommit(start.last);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={size.width}
      aria-valuemin={min}
      aria-valuemax={upper}
      tabIndex={0}
      className={className === undefined ? "splitter" : `splitter ${className}`}
      data-edge={edge}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => set(null)}
    />
  );
}
