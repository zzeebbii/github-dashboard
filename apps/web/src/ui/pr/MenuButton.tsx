import { Check } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../Icon.tsx";

interface MenuOption {
  readonly value: string;
  readonly label: string;
  readonly checked: boolean;
  /** Shown after the label, e.g. a count. */
  readonly detail?: string;
}

interface MenuButtonProps {
  /** The button's content; it is also the menu's name. */
  readonly button: ReactNode;
  /** `radio`: one choice, closes on select. `checkbox`: toggles, stays open. */
  readonly kind: "radio" | "checkbox";
  readonly options: readonly MenuOption[];
  readonly onSelect: (value: string) => void;
  /** An extra command after a separator, e.g. "Clear filter". */
  readonly footer?: { readonly label: string; readonly onSelect: () => void } | undefined;
  readonly align?: "start" | "end";
  readonly dashed?: boolean;
}

const menuItems = (root: HTMLElement | null): HTMLElement[] =>
  Array.from(root?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);

/**
 * A WAI-ARIA menu button with radio or checkbox items, the same keyboard model as the
 * account menu: Enter, Space or Down opens on the first item, Up on the last; arrows, Home
 * and End move; Esc closes and returns focus to the button; Tab or a click elsewhere closes.
 */
export function MenuButton({
  button,
  kind,
  options,
  onSelect,
  footer,
  align = "start",
  dashed = false,
}: MenuButtonProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [openAt, setOpenAt] = useState<"first" | "last" | null>(null);
  const open = openAt !== null;

  useEffect(() => {
    if (openAt === null) return;
    const all = menuItems(menu.current);
    (openAt === "first" ? all[0] : all.at(-1))?.focus();
  }, [openAt]);

  function close() {
    setOpenAt(null);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const all = menuItems(menu.current);
    const current = all.findIndex((item) => item === document.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: (current + 1) % all.length,
      ArrowUp: (current - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      all[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div
      className={`menu-anchor${align === "end" ? " menu-anchor-end" : ""}`}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpenAt(null);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        id={`${id}-button`}
        className={`filter-button${dashed ? " filter-button-dashed" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpenAt(open ? null : "first")}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpenAt(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        {button}
      </button>
      {open && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          className="filter-popover"
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role={kind === "radio" ? "menuitemradio" : "menuitemcheckbox"}
              aria-checked={option.checked}
              tabIndex={-1}
              className="menu-item"
              onClick={() => {
                onSelect(option.value);
                if (kind === "radio") close();
              }}
            >
              {kind === "checkbox" && (
                <span className="filter-check" data-checked={option.checked}>
                  {option.checked && <Icon icon={Check} size={11} />}
                </span>
              )}
              <span className="filter-option-label">{option.label}</span>
              {option.detail !== undefined && (
                <span className="filter-option-detail">{option.detail}</span>
              )}
              {kind === "radio" && option.checked && <Icon icon={Check} size={14} />}
            </button>
          ))}
          {footer !== undefined && (
            <>
              <div role="separator" className="menu-separator" />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="menu-item"
                onClick={() => {
                  close();
                  footer.onSelect();
                }}
              >
                {footer.label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
