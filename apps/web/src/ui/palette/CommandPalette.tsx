import { type LucideIcon, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { Dialog } from "../Dialog.tsx";
import { Icon } from "../Icon.tsx";

export interface PaletteOption {
  /** Unique across all groups. */
  readonly key: string;
  readonly label: string;
  /** Shown after the label, e.g. `web#123`. */
  readonly hint?: string;
  readonly icon: LucideIcon;
  readonly run: () => void;
}

interface PaletteGroup {
  readonly key: string;
  readonly label: string;
  readonly options: readonly PaletteOption[];
}

interface CommandPaletteProps {
  readonly label: string;
  readonly placeholder: string;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** Empty groups are not shown. */
  readonly groups: readonly PaletteGroup[];
  /** "{n} results", announced inside the dialog: the rest of the page is inert. */
  readonly resultsLabel: string;
  readonly noResultsLabel: string;
  /** Esc, a backdrop click, or an option run. */
  readonly onClose: () => void;
}

/**
 * The command palette (FR-7.1, FR-7.2): an ARIA combobox whose listbox of grouped options
 * is always shown. Arrow keys, Home and End move the active option, Enter runs it.
 *
 * Rendered only while open, in the shared modal ui/Dialog.tsx: focus stays inside (the
 * search input gets it first), Esc and a backdrop click close it, and focus goes back to
 * the element that had it before.
 */
export function CommandPalette({
  label,
  placeholder,
  query,
  onQueryChange,
  groups,
  resultsLabel,
  noResultsLabel,
  onClose,
}: CommandPaletteProps) {
  const id = useId();
  const [active, setActive] = useState(0);

  const shown = groups.filter((group) => group.options.length > 0);
  const options = shown.flatMap((group) => group.options);
  const current = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;
  const activeId = current >= 0 ? optionId(current) : undefined;

  useEffect(() => {
    if (activeId !== undefined)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function run(option: PaletteOption | undefined) {
    if (option === undefined) return;
    onClose();
    option.run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(current + 1, last),
      ArrowUp: Math.max(current - 1, 0),
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(options[current]);
    }
  }

  let index = 0;
  return (
    <Dialog className="palette" aria-label={label} onClose={onClose}>
      <div className="palette-search">
        <Icon icon={Search} />
        <input
          type="text"
          role="combobox"
          aria-label={placeholder}
          placeholder={placeholder}
          aria-expanded={options.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setActive(0);
            onQueryChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <div role="listbox" id={`${id}-list`} aria-label={label} className="palette-list">
        {shown.map((group) => (
          <div key={group.key} role="group" aria-labelledby={`${id}-${group.key}`}>
            <div role="presentation" id={`${id}-${group.key}`} className="palette-group">
              {group.label}
            </div>
            {group.options.map((option) => {
              const at = index++;
              return (
                // Focus stays in the combobox; the listbox is driven from there (APG pattern).
                <div
                  key={option.key}
                  id={optionId(at)}
                  role="option"
                  aria-selected={at === current}
                  className="palette-option"
                  onMouseMove={() => {
                    setActive(at);
                  }}
                  onClick={() => {
                    run(option);
                  }}
                >
                  <Icon icon={option.icon} />
                  <span className="palette-label">{option.label}</span>
                  {option.hint !== undefined && <span className="palette-hint">{option.hint}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {options.length === 0 && <p className="palette-empty">{noResultsLabel}</p>}
      <div role="status" className="sr-only">
        {options.length === 0 ? noResultsLabel : resultsLabel}
      </div>
    </Dialog>
  );
}
