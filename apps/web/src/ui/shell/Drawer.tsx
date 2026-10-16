import { X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Dialog } from "../Dialog.tsx";
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
 * The sidebar as a modal drawer below 768 px (FR-1.7), on ui/Dialog.tsx: the rest of the
 * page is inert, Esc closes it and focus returns to the element that opened it.
 */
export function Drawer({ open, onClose, label, closeLabel, children }: DrawerProps) {
  function onClick(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("a") !== null) onClose();
  }

  return (
    <Dialog open={open} className="drawer" aria-label={label} onClose={onClose} onClick={onClick}>
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
    </Dialog>
  );
}
