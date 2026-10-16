import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useT } from "../../application/i18n.tsx";

/**
 * Placeholder for `/repo/$owner/$name/pull/$number`, shown over the repository page. The real
 * modal panel (focus handling, tabs) is T24. Closing is a link back to the repository, so
 * Back closes it too (FR-1.6).
 */
export function PrPanel({ owner, name, number }: { owner: string; name: string; number: string }) {
  const t = useT();
  const headingId = useId();
  return (
    <section className="panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("pullNumber", { n: number })}</h2>
      <Link to="/repo/$owner/$name" params={{ owner, name }}>
        {t("closePanel")}
      </Link>
    </section>
  );
}
