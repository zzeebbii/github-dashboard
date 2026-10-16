import { ArrowUpDown, ChevronDown, CirclePlus, Clock, Search, X } from "lucide-react";
import { useId } from "react";
import type { Translate } from "../../application/i18n.tsx";
import {
  hasActivePrFilters,
  type PrFilters,
  sortKeys,
  updatedWindows,
} from "../../application/pr-filters.ts";
import type { SortKey } from "../../domain/sort.ts";
import { Icon } from "../Icon.tsx";
import { MenuButton } from "./MenuButton.tsx";

interface LabelCount {
  readonly name: string;
  readonly count: number;
}

interface FilterBarProps {
  readonly t: Translate;
  readonly filters: PrFilters;
  /** The labels on the unfiltered list, for the label menu. */
  readonly labels: readonly LabelCount[];
  readonly onChange: (patch: Partial<PrFilters>) => void;
  readonly onReset: () => void;
}

const updatedKeys = {
  any: "u_anytime",
  "24h": "u_24h",
  "7d": "u_7d",
  "30d": "u_30d",
  stale: "u_stale",
} as const;

const sortLabelKeys: Record<SortKey, "so_waiting" | "so_updated" | "so_newest" | "so_size"> = {
  waiting: "so_waiting",
  updated: "so_updated",
  newest: "so_newest",
  smallest: "so_size",
};

/**
 * The design's filter row: text, label, updated (incl. stale), drafts, Reset, and the sort
 * menu on the right (FR-5.7). Controlled: the composer keeps the state in the URL.
 */
export function FilterBar({ t, filters, labels, onChange, onReset }: FilterBarProps) {
  const inputId = useId();
  const selected = filters.label;
  // Selected labels stay listed even when no PR in the list has them any more.
  const labelOptions = [
    ...labels,
    ...selected
      .filter((l) => !labels.some((x) => x.name === l))
      .map((name) => ({ name, count: 0 })),
  ].toSorted((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="filter-bar" role="group" aria-label={t("filters")}>
      <div className="filter-search">
        <label htmlFor={inputId} className="sr-only">
          {t("pr_filterLabel")}
        </label>
        <Icon icon={Search} size={14} />
        <input
          id={inputId}
          type="search"
          value={filters.q}
          placeholder={t("filterPh")}
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </div>
      {labelOptions.length > 0 && (
        <MenuButton
          dashed
          kind="checkbox"
          button={
            <>
              <Icon icon={CirclePlus} size={14} />
              {t("f_label")}
              {selected.length > 0 && <span className="sr-only">: </span>}
              {selected.length > 0 && (
                <span className="filter-badge">
                  {selected.length === 1 ? selected[0] : `${selected.length} ${t("selected")}`}
                </span>
              )}
            </>
          }
          options={labelOptions.map(({ name, count }) => ({
            value: name,
            label: name,
            checked: selected.includes(name),
            detail: String(count),
          }))}
          onSelect={(name) =>
            onChange({
              label: selected.includes(name)
                ? selected.filter((l) => l !== name)
                : [...selected, name],
            })
          }
          footer={
            selected.length > 0
              ? { label: t("clearFilter"), onSelect: () => onChange({ label: [] }) }
              : undefined
          }
        />
      )}
      <MenuButton
        dashed
        kind="radio"
        button={
          <>
            <Icon icon={Clock} size={14} />
            {filters.updated === "any" ? t("u_any") : t(updatedKeys[filters.updated])}
          </>
        }
        options={updatedWindows.map((value) => ({
          value,
          label: t(updatedKeys[value]),
          checked: filters.updated === value,
        }))}
        onSelect={(value) => {
          const updated = updatedWindows.find((w) => w === value);
          if (updated !== undefined) onChange({ updated });
        }}
      />
      <button
        type="button"
        role="switch"
        aria-checked={filters.drafts}
        className="filter-button filter-switch"
        onClick={() => onChange({ drafts: !filters.drafts })}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        {t("drafts")}
      </button>
      {hasActivePrFilters(filters) && (
        <button type="button" className="filter-button" onClick={onReset}>
          {t("reset")}
          <Icon icon={X} size={14} />
        </button>
      )}
      <MenuButton
        kind="radio"
        align="end"
        button={
          <>
            <Icon icon={ArrowUpDown} size={14} />
            <span className="sr-only">{t("pr_sortBy")} </span>
            {t(sortLabelKeys[filters.sort])}
            <Icon icon={ChevronDown} size={14} />
          </>
        }
        options={sortKeys.map((value) => ({
          value,
          label: t(sortLabelKeys[value]),
          checked: filters.sort === value,
        }))}
        onSelect={(value) => {
          const sort = sortKeys.find((k) => k === value);
          if (sort !== undefined) onChange({ sort });
        }}
      />
    </div>
  );
}
