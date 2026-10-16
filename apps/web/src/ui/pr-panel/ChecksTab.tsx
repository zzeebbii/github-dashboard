import {
  ArrowUpRight,
  CircleCheck,
  CircleSlash,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { CheckRun } from "../../domain/pr-detail.ts";
import { type CheckOutcome, checkDuration, checkOutcome } from "../../domain/pr-panel.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { Icon } from "../Icon.tsx";
import type { PanelContext } from "./TimelineItem.tsx";

const OUTCOME: Record<
  CheckOutcome,
  { icon: LucideIcon; tone: string; title: MessageKey; open: boolean }
> = {
  failed: { icon: CircleX, tone: "red", title: "pp_failed", open: true },
  running: { icon: LoaderCircle, tone: "amber", title: "pp_running", open: true },
  passed: { icon: CircleCheck, tone: "green", title: "pp_passed", open: false },
  skipped: { icon: CircleSlash, tone: "muted", title: "pp_skipped", open: false },
};
const ORDER: readonly CheckOutcome[] = ["failed", "running", "passed", "skipped"];

const CONCLUSION: Partial<Record<NonNullable<CheckRun["conclusion"]>, MessageKey>> = {
  CANCELLED: "pp_cancelled",
  NEUTRAL: "pp_neutral",
  SKIPPED: "pp_skippedRun",
  STALE: "pp_stale",
};

/** "GitHub Actions · Failed after 2m 5s", after the design's check `sub` line. */
function status(ctx: PanelContext, run: CheckRun, outcome: CheckOutcome): string {
  const { t, format } = ctx;
  const ms = checkDuration(run);
  const d = ms === null ? "" : format.duration(ms);
  if (outcome === "running") return t(run.status === "IN_PROGRESS" ? "pp_inProgress" : "pp_queued");
  if (outcome === "failed") return d === "" ? t("pp_failedRun") : t("pp_failedAfter", { d });
  if (outcome === "passed") return d === "" ? t("pp_passedRun") : t("pp_succeededIn", { d });
  const key = run.conclusion === null ? undefined : CONCLUSION[run.conclusion];
  return t(key ?? "pp_skippedRun");
}

function Run({ ctx, run, outcome }: { ctx: PanelContext; run: CheckRun; outcome: CheckOutcome }) {
  const { t } = ctx;
  const { icon, tone } = OUTCOME[outcome];
  const sub = [run.app, status(ctx, run, outcome)].filter((part) => part !== null).join(" · ");
  return (
    <li className="pp-run">
      <div className="pp-run-head">
        <span className={outcome === "running" ? "pp-tone pr-spin" : "pp-tone"} data-tone={tone}>
          <Icon icon={icon} size={16} />
        </span>
        <div className="pp-run-text">
          <span className="pp-run-name">{run.name}</span>
          <span className="pp-muted">{sub}</span>
        </div>
        {run.isRequired === true && <span className="pp-badge">{t("required")}</span>}
        {run.detailsUrl?.startsWith("https://github.com/") === true && (
          <a
            href={run.detailsUrl}
            className="pp-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("pp_logsFor", { name: run.name })}
          >
            {t("logs")}
            <Icon icon={ArrowUpRight} size={13} />
          </a>
        )}
      </div>
      {(run.title !== null || run.summary !== null) && (
        <div className="pp-run-output">
          {run.title !== null && <p className="pp-run-title">{run.title}</p>}
          {/* Markdown, shown as plain text: never parsed as HTML. */}
          {run.summary !== null && run.summary !== "" && (
            <pre className="pp-run-summary">{run.summary}</pre>
          )}
        </div>
      )}
      {run.annotations.length > 0 && (
        <ul className="pp-annotations">
          {run.annotations.map((a) => (
            <li key={`${a.path}:${a.startLine}:${a.message}`}>
              <code>
                {a.path}:{a.startLine}
                {a.endLine === a.startLine ? "" : `–${a.endLine}`}
              </code>
              {a.level !== null && <span className="pp-badge">{a.level.toLowerCase()}</span>}
              {a.title !== null && <strong>{a.title}</strong>}
              <pre>{a.message}</pre>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The Checks tab (FR-6.3): a summary, then the runs grouped Failed / In progress / Passed /
 * Skipped, each with app, status, duration, required flag, output and, for failing runs,
 * annotations. Links to GitHub for logs; none are fetched. No re-run button (FR-6.9).
 */
export function ChecksTab({ ctx, runs }: { ctx: PanelContext; runs: readonly CheckRun[] }) {
  const { t, format } = ctx;
  const grouped = new Map<CheckOutcome, CheckRun[]>();
  for (const run of runs) {
    const outcome = checkOutcome(run);
    grouped.set(outcome, [...(grouped.get(outcome) ?? []), run]);
  }
  const failed = grouped.get("failed")?.length ?? 0;
  const passed = grouped.get("passed")?.length ?? 0;
  const summary: CheckOutcome =
    failed > 0 ? "failed" : grouped.has("running") ? "running" : "passed";
  const { icon, tone } = OUTCOME[summary];
  if (runs.length === 0) return <p className="pp-card pp-empty">{t("pp_noChecks")}</p>;
  return (
    <div className="pp-checks">
      <div className="pp-card pp-check-summary">
        <span className="pp-tone" data-tone={tone}>
          <Icon icon={icon} size={28} />
        </span>
        <div>
          <p className="pp-check-title">
            {failed > 0
              ? t("pp_failing", { n: format.number(failed) })
              : t(summary === "running" ? "pr_ciRunning" : "pr_ciPassing")}
          </p>
          <p className="pp-muted">
            {t("pp_passedOf", { a: format.number(passed), n: format.number(runs.length) })}
          </p>
        </div>
      </div>
      {ORDER.map((outcome) => {
        const group = grouped.get(outcome);
        if (group === undefined) return null;
        return (
          <details key={outcome} className="pp-card pp-check-group" open={OUTCOME[outcome].open}>
            <summary>
              <span>{t(OUTCOME[outcome].title)}</span>
              <span className="pp-count">{format.number(group.length)}</span>
            </summary>
            <ul>
              {group.map((run) => (
                <Run key={`${run.app ?? ""}/${run.name}`} ctx={ctx} run={run} outcome={outcome} />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
