import { Gauge } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { QuotaLevel } from "../../domain/quota.ts";
import { Icon } from "../Icon.tsx";

/** One pool's row, already formatted by the container. */
export interface QuotaRow {
  readonly key: string;
  readonly name: string;
  readonly remaining: string;
  readonly limit: string;
  /** 0–100. */
  readonly percent: number;
  readonly level: QuotaLevel;
  /** "Hourly limit" / "Per-minute limit". */
  readonly window: string;
  /** "Resets in 21 min · 06:21". */
  readonly reset: string;
}

interface QuotaPopoverProps {
  readonly t: Translate;
  readonly login: string;
  readonly rows: readonly QuotaRow[];
  /** The row the button summarises: the lower of GraphQL and REST. null when none is known. */
  readonly summary: QuotaRow | null;
}

const Bar = ({ percent, level }: { percent: number; level: QuotaLevel }) => (
  <span className="quota-bar" data-level={level} aria-hidden="true">
    <span style={{ width: `${percent.toFixed(1)}%` }} />
  </span>
);

/**
 * The design's quota button and popover (FR-3.12): each pool's remaining / limit and reset
 * for the active account, and how the guard behaves. A disclosure, not a menu: the button
 * toggles it, Esc closes it and returns focus, and focus or a click leaving it closes it.
 */
export function QuotaPopover({ t, login, rows, summary }: QuotaPopoverProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div
      className="quota"
      data-level={summary?.level ?? "ok"}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="quota-button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Icon icon={Gauge} size={14} />
        <span className="sr-only">{t("fr_apiQuota")}: </span>
        {summary !== null && <Bar percent={summary.percent} level={summary.level} />}
        <span>{summary === null ? "–" : t("fr_left", { n: summary.remaining })}</span>
      </button>
      <div
        id={`${id}-panel`}
        className="quota-popover"
        role="group"
        aria-labelledby={`${id}-title`}
        hidden={!open}
      >
        <div className="quota-head">
          <span id={`${id}-title`} className="quota-title">
            {t("fr_apiQuota")}
          </span>
          <span className="quota-login">{login}</span>
        </div>
        {rows.length === 0 && <p className="quota-row">{t("fr_quotaUnknown")}</p>}
        {rows.map((row) => (
          <div key={row.key} className="quota-row" data-level={row.level}>
            <div className="quota-row-line">
              <span className="quota-name">{row.name}</span>
              <span className="quota-count">
                <strong>{row.remaining}</strong> / {row.limit}
              </span>
            </div>
            <Bar percent={row.percent} level={row.level} />
            <div className="quota-row-line quota-meta">
              <span>{row.window}</span>
              <span>{row.reset}</span>
            </div>
          </div>
        ))}
        <p className="quota-note">{t("fr_quotaNote")}</p>
      </div>
    </div>
  );
}
