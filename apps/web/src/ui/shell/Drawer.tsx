import { X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { Icon } from "../Icon.tsx";

interface DrawerProps {
  readonly open: boolean;
  /** Called on Esc, the close button, a backdrop click or a followed link. */
  readonly onClose: () => void;
  readonly label: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
}

/**
 * The sidebar as a modal drawer below 768 px (FR-1.7).
 *
 * A native modal `<dialog>`: the browser makes the rest of the page inert (the focus trap),
 * closes it on Esc and returns focus to the element that opened it.
 */
export function Drawer({ open, onClose, label, closeLabel, children }: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target;
    // The dialog itself is only the target when the click lands on its backdrop.
    if (target === event.currentTarget) onClose();
    else if (target instanceof Element && target.closest("a") !== null) onClose();
  }

  return (
    <dialog ref={dialog} className="drawer" aria-label={label} onClose={onClose} onClick={onClick}>
      {open && (
        <>
          <button
            type="button"
            className="icon-button drawer-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon icon={X} />
          </button>
          {children}
        </>
      )}
    </dialog>
  );
}
