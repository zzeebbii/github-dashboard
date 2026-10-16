import type { MouseEvent } from "react";

/**
 * The first focusable element on every app page (FR-1.9). Hidden until focused.
 * Moves focus itself rather than following the hash, so it adds no history entry.
 */
export function SkipLink({ targetId, label }: { targetId: string; label: string }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById(targetId)?.focus();
  }
  return (
    <a className="skip-link" href={`#${targetId}`} onClick={onClick}>
      {label}
    </a>
  );
}
