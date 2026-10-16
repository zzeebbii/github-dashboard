import type { Translate } from "../../application/i18n.tsx";

interface KeyboardHintsProps {
  readonly t: Translate;
  /** J/K are on (Settings, FR-7.3); off, their hint is left out. */
  readonly listShortcuts: boolean;
  /** The palette's shortcut, e.g. "⌘K" or "Ctrl K". */
  readonly searchKey: string;
}

/** The design's shortcut hints under a list (FR-7.3). Hidden below 768 px (styles.css). */
export function KeyboardHints({ t, listShortcuts, searchKey }: KeyboardHintsProps) {
  return (
    <p className="kbd-hints">
      {listShortcuts && (
        <span>
          <kbd>J</kbd> <kbd>K</kbd> {t("kMove")}
        </span>
      )}
      <span>
        <kbd>Enter</kbd> {t("kOpen")}
      </span>
      <span>
        <kbd>Esc</kbd> {t("kClose")}
      </span>
      <span>
        <kbd>{searchKey}</kbd> {t("kSearch")}
      </span>
    </p>
  );
}
