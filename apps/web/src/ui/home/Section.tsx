import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Icon } from "../Icon.tsx";

interface SectionProps {
  readonly title: string;
  readonly hint: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Shown instead of `children` when the section has no rows. */
  readonly emptyText: string;
  readonly children: ReactNode;
}

/**
 * One Home section, after the design's `groups` card (FR-5.5): a heading whose button
 * collapses it, with the count and hint, then the rows or the empty text.
 */
export function Section({
  title,
  hint,
  count,
  expanded,
  onToggle,
  emptyText,
  children,
}: SectionProps) {
  const bodyId = useId();
  return (
    <section className="home-section" aria-label={title}>
      <h2 className="home-section-heading">
        <button
          type="button"
          className="home-section-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
          <span className="home-section-title">{title}</span>
          <span className="home-section-count">{count}</span>
          <span className="home-section-hint">{hint}</span>
        </button>
      </h2>
      {/* Always in the DOM for aria-controls; its rows only while expanded. */}
      <div id={bodyId} hidden={!expanded}>
        {expanded && (count === 0 ? <p className="home-section-empty">{emptyText}</p> : children)}
      </div>
    </section>
  );
}

/** A search hit GitHub's 1,000-result cap, so some PRs are missing (AC-5.7). */
export function TruncationNotice({ text }: { readonly text: string }) {
  return (
    <p className="home-notice" role="status">
      <Icon icon={TriangleAlert} size={14} />
      {text}
    </p>
  );
}
