import { afterEach, beforeEach, expect, vi } from "vitest";

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

function describeArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * AC-2.7: call once at the top of every auth test file. Captures all console output for
 * each test and fails the test if any of `tokens` appears in it.
 */
export function guardAgainstTokenLeaks(tokens: readonly string[]): void {
  let output: string[] = [];

  beforeEach(() => {
    output = [];
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map(describeArg).join(" "));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const all = output.join("\n");
    for (const token of tokens) expect(all, "a token reached the console").not.toContain(token);
  });
}

/** Every string a thrown value could surface: message, stack, cause, serialised form. */
export function everythingAbout(error: unknown): string {
  if (!(error instanceof Error)) return describeArg(error);
  return [String(error), error.stack, JSON.stringify(error), describeArg(error.cause)].join("\n");
}

/** A Storage's entries as a plain object (spreading a Storage instance is unreliable). */
export function entriesOf(storage: Storage): Record<string, string | null> {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? "");
  return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]));
}
