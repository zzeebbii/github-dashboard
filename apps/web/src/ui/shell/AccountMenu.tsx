import { Check, LogOut, Plus, TriangleAlert, UserMinus } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { AccountId } from "../../domain/account.ts";
import { Icon } from "../Icon.tsx";

export interface AccountMenuEntry {
  readonly id: AccountId;
  readonly login: string;
  readonly status: "remembered" | "session" | "signed-out";
}

interface AccountMenuProps {
  readonly t: Translate;
  readonly accounts: readonly AccountMenuEntry[];
  readonly active: AccountMenuEntry;
  /** The active account's classic token has `repo` (FR-2.3). */
  readonly writeAccess: boolean;
  readonly onSelect: (id: AccountId) => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
  readonly onSignOutEverything: () => void;
}

const statusKeys = {
  remembered: "am_remembered",
  session: "am_sessionTabs",
  "signed-out": "am_signedOut",
} as const;

const menuItems = (root: HTMLElement | null): HTMLElement[] =>
  Array.from(root?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);

const initials = (login: string) => login.slice(0, 2).toUpperCase();

/**
 * The design's account button and menu: the accounts (the active one checked), "Add GitHub
 * account", then remove and sign out of everything.
 *
 * The WAI-ARIA menu button pattern: Enter, Space or Down opens on the first item, Up on the
 * last; arrows, Home and End move; Esc closes and returns focus to the button; Tab or a click
 * elsewhere closes. Choosing an item also returns focus to the button.
 */
export function AccountMenu({
  t,
  accounts,
  active,
  writeAccess,
  onSelect,
  onAdd,
  onRemove,
  onSignOutEverything,
}: AccountMenuProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // null: closed. Otherwise the item to focus once open.
  const [openAt, setOpenAt] = useState<"first" | "last" | null>(null);
  const open = openAt !== null;

  const items = () => menuItems(menu.current);

  useEffect(() => {
    if (openAt === null) return;
    const all = menuItems(menu.current);
    (openAt === "first" ? all[0] : all.at(-1))?.focus();
  }, [openAt, menu]);

  function close(returnFocus: boolean) {
    setOpenAt(null);
    if (returnFocus) button.current?.focus();
  }

  function choose(action: () => void) {
    close(true);
    action();
  }

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpenAt(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const all = items();
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
      close(true);
    }
  }

  const item = (label: ReactNode, icon: ReactNode, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className="menu-item"
      onClick={() => choose(action)}
    >
      <span className="menu-item-icon">{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      className="account-menu"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) close(false);
      }}
    >
      <button
        ref={button}
        type="button"
        id={`${id}-button`}
        className="account-button"
        title={active.login}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => {
          setOpenAt(open ? null : "first");
        }}
        onKeyDown={onButtonKeyDown}
      >
        {/* The visible initials are decoration; the name is the hidden text, so they never disagree. */}
        <span aria-hidden="true">{initials(active.login)}</span>
        <span className="sr-only">{t("am_button", { login: active.login })}</span>
        {writeAccess && <span className="account-warning-dot" />}
      </button>
      {open && (
        <div className="account-popover">
          {writeAccess && (
            <p id={`${id}-warning`} className="account-warning">
              <Icon icon={TriangleAlert} size={14} />
              {t("tw_writeAccess")}
            </p>
          )}
          <div
            ref={menu}
            id={`${id}-menu`}
            role="menu"
            aria-labelledby={`${id}-button`}
            aria-describedby={writeAccess ? `${id}-warning` : undefined}
            onKeyDown={onMenuKeyDown}
          >
            <div role="group" aria-labelledby={`${id}-accounts`}>
              <div id={`${id}-accounts`} className="menu-heading">
                {t("am_accounts")}
              </div>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={account.id === active.id}
                  tabIndex={-1}
                  className="menu-item"
                  onClick={() => choose(() => onSelect(account.id))}
                >
                  <span className="menu-item-avatar">{initials(account.login)}</span>
                  <span className="menu-item-text">
                    <span className="menu-item-login">{account.login}</span>
                    <span className="menu-item-sub">{t(statusKeys[account.status])}</span>
                  </span>
                  {account.id === active.id && <Icon icon={Check} size={14} />}
                </button>
              ))}
            </div>
            <div role="separator" className="menu-separator" />
            {item(t("am_add"), <Icon icon={Plus} size={14} />, onAdd)}
            <div role="separator" className="menu-separator" />
            {item(
              t("am_remove", { login: active.login }),
              <Icon icon={UserMinus} size={14} />,
              onRemove,
            )}
            {item(t("am_signOutAll"), <Icon icon={LogOut} size={14} />, onSignOutEverything)}
          </div>
        </div>
      )}
    </div>
  );
}
