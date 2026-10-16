/**
 * The command palette's matching rule (FR-7.1): a case-insensitive substring of any of an
 * item's texts. An empty query matches everything. A PR's texts are its title, `#number`
 * and `owner/name`, so "#123" and "123" both find PR 123.
 */
export function matchesQuery(query: string, texts: readonly string[]): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || texts.some((text) => text.toLowerCase().includes(needle));
}

/** The texts a pull request is matched on. */
export const pullRequestTexts = (pr: {
  readonly title: string;
  readonly number: number;
  readonly repository: string;
}): string[] => [pr.title, `#${pr.number}`, pr.repository];
