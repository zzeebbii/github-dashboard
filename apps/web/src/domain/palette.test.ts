import { describe, expect, test } from "vitest";
import { matchesQuery, pullRequestTexts } from "./palette.ts";

describe("matchesQuery", () => {
  const pr = pullRequestTexts({ title: "Fix Login redirect", number: 123, repository: "acme/web" });

  test.each(["login", "LOGIN", "  fix ", "#123", "123", "12", "acme/web", "ACME/", ""])(
    "%j matches",
    (query) => {
      expect(matchesQuery(query, pr)).toBe(true);
    },
  );

  test.each(["logout", "#124", "acme/api"])("%j does not match", (query) => {
    expect(matchesQuery(query, pr)).toBe(false);
  });
});
