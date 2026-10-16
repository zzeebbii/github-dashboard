import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";

/** A dialog needs an accessible name: a visible heading's id, or a label. */
type Name = { readonly "aria-labelledby": string } | { readonly "aria-label": string };

type DialogProps = Name &
  Omit<ComponentPropsWithoutRef<"dialog">, "open" | "onClose" | "onCancel"> & {
    /**
     * Whether it is shown. Defaults to true, for a dialog that is rendered only while open
     * (unmounting it closes it); pass it to keep one mounted and toggle it.
     */
    readonly open?: boolean;
    /** Esc or a backdrop click asked to close; the caller decides (sets `open`, navigates). */
    readonly onClose: () => void;
    /** Focused once open, e.g. a heading with tabIndex -1. Default: the first focusable element. */
    readonly initialFocus?: RefObject<HTMLElement | null>;
    /**
     * Where focus goes when it closes or unmounts. Default: the element that had focus when
     * it opened, if it is still in the page (what a native `<dialog>` does on close()).
     */
    readonly returnFocus?: () => HTMLElement | null;
    /** Variants are classes: `drawer` (side, from the left), `pr-sheet` (side, from the right). */
    readonly className?: string;
  };

const TABBABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/**
 * The modal dialog primitive (FR-6.7): a native `<dialog>` opened with showModal(), so the
 * browser makes the rest of the page inert, keeps it in the top layer and gives it a
 * ::backdrop. On top of that:
 *
 * - Tab and Shift+Tab wrap inside it. Natively they would leave for the browser's own UI.
 * - Focus returns on close AND on unmount. Removing an open `<dialog>` (a route change)
 *   restores nothing natively.
 * - Esc and a backdrop click call `onClose`; the browser's own close is the fallback.
 *
 * The `<dialog>` stays mounted while `open` is false, hidden by the browser.
 */
export function Dialog({
  open = true,
  onClose,
  initialFocus,
  returnFocus,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  // Read at close time, so the latest callbacks are used without re-running the effects.
  const latest = useRef({ onClose, returnFocus });
  useLayoutEffect(() => {
    latest.current = { onClose, returnFocus };
  });

  // A layout effect: its cleanup runs while the <dialog> is still in the page, so focus can
  // move before the browser drops it to <body>.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null || !open) return undefined;
    // The browser closed it itself (e.g. a cancel it would not let us prevent).
    const closedByBrowser = () => {
      latest.current.onClose();
    };
    element.addEventListener("close", closedByBrowser);
    opener.current = document.activeElement;
    if (!element.open) element.showModal();
    initialFocus?.current?.focus();
    return () => {
      // Removed first: our own close() below must not report itself as a close request.
      element.removeEventListener("close", closedByBrowser);
      if (element.open) element.close();
      const target = latest.current.returnFocus?.() ?? opener.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [open, initialFocus]);

  function wrapTab(event: KeyboardEvent<HTMLDialogElement>) {
    onKeyDown?.(event);
    if (event.key === "Escape") {
      // Ours to close: the caller may navigate, which unmounts the dialog.
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)].filter(
      (item) => item.checkVisibility() && item.closest("[inert]") === null,
    );
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    const inside = active instanceof Node && event.currentTarget.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    onClick?.(event);
    // The dialog itself is only the target when the click lands on its backdrop.
    if (!event.defaultPrevented && event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      {...rest}
      ref={dialog}
      className={className}
      onClick={closeOnBackdrop}
      onKeyDown={wrapTab}
    >
      {children}
    </dialog>
  );
}
