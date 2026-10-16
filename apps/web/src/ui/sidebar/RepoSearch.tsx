import { CircleAlert, Regex, Search } from "lucide-react";
import { useId } from "react";
import type { Translate } from "../../application/i18n.tsx";
import { MAX_SEARCH_LENGTH, type RepoSearchMode } from "../../domain/repo-search.ts";
import { Icon } from "../Icon.tsx";

interface RepoSearchProps {
  readonly t: Translate;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly mode: RepoSearchMode;
  /** Repositories matching, for the hint. */
  readonly matchCount: number;
}

/**
 * The design's "Find a repository…" field with its hint (`sideHint`): the regex hint when
 * empty, the match count while searching, or why the pattern runs as text. Unlike the
 * design the hint stays when the field loses focus: hiding it on blur moved the list under
 * the pointer mid-click, and it is the field's description for screen readers.
 */
export function RepoSearch({ t, value, onChange, mode, matchCount }: RepoSearchProps) {
  const inputId = useId();
  const hintId = useId();
  const error = mode === "invalidRegex" || mode === "tooComplex";
  const hint =
    mode === "invalidRegex"
      ? t("invalidRegex")
      : mode === "tooComplex"
        ? t("sb_tooComplex")
        : mode === "regex"
          ? t("matches", { n: matchCount })
          : mode === "substring"
            ? t("sb_matches", { n: matchCount })
            : t("regexHint");

  return (
    <div className="repo-search">
      <div className="repo-search-field">
        <Icon icon={Search} size={14} />
        <label htmlFor={inputId} className="sr-only">
          {t("sb_search")}
        </label>
        <input
          id={inputId}
          type="search"
          value={value}
          maxLength={MAX_SEARCH_LENGTH}
          spellCheck={false}
          autoComplete="off"
          placeholder={t("findRepo")}
          aria-describedby={hintId}
          aria-invalid={error}
          data-pattern={mode === "none" ? undefined : ""}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <span className="repo-search-badge" title={t("regexHint")} aria-hidden="true">
          .*
        </span>
      </div>
      <p
        id={hintId}
        className="repo-search-hint"
        data-error={error || undefined}
        aria-live="polite"
      >
        <Icon icon={error ? CircleAlert : Regex} size={12} />
        <span>{hint}</span>
      </p>
    </div>
  );
}
