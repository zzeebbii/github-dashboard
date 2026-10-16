import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAnnounce } from "../../application/announcer.tsx";
import { useAccountActions, useAccounts } from "../../application/auth-provider.tsx";
import { useT } from "../../application/i18n.tsx";
import { type Account, tokenWarnings } from "../../domain/account.ts";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { AccountMenu, type AccountMenuEntry } from "../../ui/shell/AccountMenu.tsx";

/** Wires the header's account menu to the accounts and their actions (FR-2.6, FR-2.9). */
export function AccountMenuContainer() {
  const t = useT();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const { accounts, activeAccount } = useAccounts();
  const actions = useAccountActions();
  // Read at render time, not snapshotted: a 401 removes a token outside React.
  const { isSignedIn } = actions;
  const [confirming, setConfirming] = useState<"remove" | "sign-out-all" | null>(null);

  if (activeAccount === null) return null;
  const active = activeAccount;

  const entry = (account: Account): AccountMenuEntry => ({
    id: account.id,
    login: account.login,
    status: !isSignedIn(account.id) ? "signed-out" : account.rememberMe ? "remembered" : "session",
  });

  async function select(account: Account) {
    if (!isSignedIn(account.id)) {
      await navigate({ to: "/sign-in", search: { account: account.login } });
      return;
    }
    if (account.id === active.id) return;
    await actions.switchActive(account.id);
    announce(t("am_switched", { login: account.login }));
    // As in the design: a switch lands on Home, since the old page may not exist for this account.
    await navigate({ to: "/" });
  }

  async function confirm() {
    setConfirming(null);
    if (confirming === "sign-out-all") {
      await actions.signOutEverything();
      return;
    }
    await actions.remove(active.id);
    // Home, or sign-in when no signed-in account is left (the route decides).
    await navigate({ to: "/" });
  }

  return (
    <>
      <AccountMenu
        t={t}
        accounts={accounts.map(entry)}
        active={entry(active)}
        writeAccess={tokenWarnings(active).length > 0}
        onSelect={(id) => {
          const account = accounts.find((a) => a.id === id);
          if (account !== undefined) void select(account);
        }}
        onAdd={() => void navigate({ to: "/sign-in" })}
        onRemove={() => {
          setConfirming("remove");
        }}
        onSignOutEverything={() => {
          setConfirming("sign-out-all");
        }}
      />
      {confirming !== null && (
        <ConfirmDialog
          title={
            confirming === "remove"
              ? t("am_removeTitle", { login: active.login })
              : t("am_signOutAllTitle")
          }
          body={
            confirming === "remove"
              ? t("am_removeBody", { login: active.login })
              : t("am_signOutAllBody")
          }
          confirmLabel={confirming === "remove" ? t("am_removeConfirm") : t("am_signOutAll")}
          cancelLabel={t("am_cancel")}
          onConfirm={() => void confirm()}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}
