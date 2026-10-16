import type { Repository } from "./favourites.ts";

/**
 * The sidebar's repository search (FR-4.3, AC-4.2). Matches `owner/name` only, never
 * descriptions, case-insensitively, and never asks GitHub: it filters the cached list.
 *
 * Input with a regex metacharacter is a JavaScript regex, anything else a substring. A dot
 * alone does not count: `next.js` is a name, not a pattern. As in the design, a pattern
 * that does not compile is reported and matched as plain text instead.
 *
 * Guarding against catastrophic backtracking: JavaScript has no regex timeout, and a
 * pattern runs on the main thread for every repository on every keystroke, so a pattern
 * that might backtrack badly is refused before it runs (`tooComplex`, matched as plain
 * text). Measured in V8 on a 140-character name (the longest GitHub allows, 39 + 1 + 100):
 * `(a+)+$` and `(a|aa)*x` hang for over a minute; `a*a*a*b` takes 20 ms, four quantifiers
 * 0.5–2 s, six 85 s; two quantifiers stay under 1 ms. So a pattern is refused when it has
 *
 * - a quantified group whose body holds a quantifier or an alternation (nested
 *   quantifiers, `(a|aa)*`), the exponential cases;
 * - more than two quantifiers, which bounds the polynomial ones at O(n³) per name;
 * - a backreference, which no bound covers.
 *
 * This refuses a few harmless patterns (`(ab|cd)+`) in exchange for a bound that holds
 * whatever the names are, without a worker or a step counter. Input is capped at 200
 * characters.
 */

export const MAX_SEARCH_LENGTH = 200;
const MAX_QUANTIFIERS = 2;
const METACHARACTERS = /[\\^$*+?()[\]{}|]/;
const BRACE_QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

export type RepoSearchMode = "none" | "substring" | "regex" | "invalidRegex" | "tooComplex";

export interface RepoSearch {
  readonly mode: RepoSearchMode;
  /** Whether a repository's `owner/name` matches. */
  readonly matches: (nameWithOwner: string) => boolean;
}

export function parseRepoSearch(input: string): RepoSearch {
  const text = input.slice(0, MAX_SEARCH_LENGTH).trim();
  if (text === "") return { mode: "none", matches: () => true };
  const lower = text.toLowerCase();
  const substring = (mode: RepoSearchMode): RepoSearch => ({
    mode,
    matches: (name) => name.toLowerCase().includes(lower),
  });
  if (!METACHARACTERS.test(text)) return substring("substring");

  let regex: RegExp;
  try {
    regex = new RegExp(text, "i");
  } catch {
    return substring("invalidRegex");
  }
  if (!isBoundedPattern(text)) return substring("tooComplex");
  return { mode: "regex", matches: (name) => regex.test(name) };
}

/** Skips a group's opening syntax after `(`: `?:`, `?=`, `?!`, `?<=`, `?<!` or `?<name>`. */
function groupBodyStart(pattern: string, open: number): number {
  if (pattern[open + 1] !== "?") return open + 1;
  if (pattern[open + 2] === "<" && pattern[open + 3] !== "=" && pattern[open + 3] !== "!") {
    return pattern.indexOf(">", open) + 1;
  }
  return open + (pattern[open + 2] === "<" ? 4 : 3);
}

/** The index after a character class starting at `open` (`[`). */
function classEnd(pattern: string, open: number): number {
  let i = open + 1;
  while (i < pattern.length && pattern[i] !== "]") i += pattern[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** The length of the quantifier at `i`, or 0 when there is none. */
function quantifierLength(pattern: string, i: number): number {
  const c = pattern[i];
  if (c === "*" || c === "+" || c === "?") return 1;
  if (c === "{") return BRACE_QUANTIFIER.exec(pattern.slice(i))?.[0].length ?? 0;
  return 0;
}

/**
 * The rules above, on a pattern that already compiled. `risky[d]` says whether the open
 * group at depth `d` holds a quantifier or an alternation so far.
 */
function isBoundedPattern(pattern: string): boolean {
  const risky: boolean[] = [];
  let quantifiers = 0;
  /** Whether the atom just read is a group holding a quantifier or an alternation. */
  let riskyGroupBefore = false;
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    const quantifier = quantifierLength(pattern, i);
    if (quantifier > 0) {
      quantifiers += 1;
      if (riskyGroupBefore || quantifiers > MAX_QUANTIFIERS) return false;
      risky.fill(true);
      i += quantifier;
      if (pattern[i] === "?") i += 1; // lazy
      riskyGroupBefore = false;
      continue;
    }
    riskyGroupBefore = false;
    if (c === "\\") {
      if (/[1-9k]/.test(pattern[i + 1] ?? "")) return false;
      i += 2;
    } else if (c === "[") {
      i = classEnd(pattern, i);
    } else if (c === "(") {
      risky.push(false);
      i = groupBodyStart(pattern, i);
    } else if (c === ")") {
      riskyGroupBefore = risky.pop() ?? false;
      if (riskyGroupBefore && risky.length > 0) risky[risky.length - 1] = true;
      i += 1;
    } else {
      if (c === "|" && risky.length > 0) risky[risky.length - 1] = true;
      i += 1;
    }
  }
  return true;
}

export interface OwnerGroup {
  readonly owner: string;
  readonly repositories: readonly Repository[];
}

/** Repositories grouped by owner, owners in the order they first appear (FR-4.2). */
export function groupByOwner(repositories: readonly Repository[]): readonly OwnerGroup[] {
  const groups = new Map<string, Repository[]>();
  for (const repository of repositories) {
    const owner = repository.nameWithOwner.split("/")[0] ?? "";
    const group = groups.get(owner);
    if (group === undefined) groups.set(owner, [repository]);
    else group.push(repository);
  }
  return [...groups].map(([owner, list]) => ({ owner, repositories: list }));
}
