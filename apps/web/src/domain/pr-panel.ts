import type { CheckRun, ReviewThread, TimelineItem } from "./pr-detail.ts";
import { type Actor, isBot, toMillis } from "./pull-request.ts";

/** The conversation's presets (FR-6.2, AC-6.6). */
export const CONVERSATION_FILTERS = ["all", "unresolved", "humans"] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

/** One entry of the conversation, oldest first. */
export type ConversationEntry =
  | { readonly kind: "item"; readonly item: TimelineItem }
  | { readonly kind: "thread"; readonly thread: ReviewThread }
  /** One bot's comments and reviews, collapsed by default, where its first one was. */
  | { readonly kind: "bot"; readonly author: Actor; readonly items: readonly TimelineItem[] };

const itemTime = (item: TimelineItem) =>
  item.kind === "comment" ? item.createdAt : (item.submittedAt ?? "");
const threadAuthor = (thread: ReviewThread) => thread.comments[0]?.author ?? null;
const threadTime = (thread: ReviewThread) => thread.comments[0]?.createdAt ?? "";
const millis = (iso: string) => (iso === "" ? 0 : toMillis(iso));

/**
 * The conversation as the panel shows it (FR-6.2): comments, reviews and review threads by
 * time. "Unresolved" keeps only unresolved threads; "Humans" drops everything a bot wrote
 * (T18's rule, `isBot`). Otherwise each bot's items are grouped into one collapsed entry.
 */
export function conversation(
  timeline: readonly TimelineItem[],
  threads: readonly ReviewThread[],
  filter: ConversationFilter,
): ConversationEntry[] {
  if (filter === "unresolved") {
    return threads
      .filter((thread) => !thread.isResolved)
      .toSorted((a, b) => millis(threadTime(a)) - millis(threadTime(b)))
      .map((thread) => ({ kind: "thread", thread }));
  }
  const timed: { at: number; entry: ConversationEntry & { kind: "item" | "thread" } }[] = [
    ...timeline.map((item) => ({
      at: millis(itemTime(item)),
      entry: { kind: "item", item } as const,
    })),
    ...threads.map((thread) => ({
      at: millis(threadTime(thread)),
      entry: { kind: "thread", thread } as const,
    })),
  ];
  // Stable: items of the same instant keep GitHub's order.
  const sorted = timed.toSorted((a, b) => a.at - b.at).map(({ entry }) => entry);

  const out: ConversationEntry[] = [];
  const bots = new Map<string, TimelineItem[]>();
  for (const entry of sorted) {
    const author = entry.kind === "item" ? entry.item.author : threadAuthor(entry.thread);
    if (!isBot(author)) {
      out.push(entry);
      continue;
    }
    if (filter === "humans" || author === null) continue;
    if (entry.kind === "thread") {
      out.push(entry);
      continue;
    }
    const login = author.login.toLowerCase();
    const group = bots.get(login);
    if (group === undefined) {
      const items = [entry.item];
      bots.set(login, items);
      out.push({ kind: "bot", author, items });
    } else {
      group.push(entry.item);
    }
  }
  return out;
}

/** How the Checks tab groups a run (the design's Failed / In progress / Passed). */
export type CheckOutcome = "failed" | "running" | "passed" | "skipped";

export function checkOutcome(run: Pick<CheckRun, "status" | "conclusion">): CheckOutcome {
  if (run.status !== "COMPLETED") return "running";
  switch (run.conclusion) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "TIMED_OUT":
    case "STARTUP_FAILURE":
    case "ACTION_REQUIRED":
      return "failed";
    default:
      return "skipped";
  }
}

/** A run's duration in ms; null until it has both a start and an end. */
export function checkDuration(run: Pick<CheckRun, "startedAt" | "completedAt">): number | null {
  if (run.startedAt === null || run.completedAt === null) return null;
  return Math.max(0, toMillis(run.completedAt) - toMillis(run.startedAt));
}
