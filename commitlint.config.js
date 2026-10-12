/**
 * Conventional Commits, enforced.
 *
 * The commit type is not bookkeeping here: it drives CHANGELOG generation and,
 * critically, the `!`/BREAKING CHANGE marker is cross-checked against the
 * OpenAPI diff. If the contract breaks but the commit does not say so, CI fails.
 * See scripts/check-breaking-changes.mjs and ADR-0012.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // a user-facing capability
        "fix", // a user-facing bug fix
        "perf",
        "refactor", // no behaviour change
        "docs",
        "test",
        "build", // build system or dependencies
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-enum": [
      1,
      "always",
      ["api", "web", "contracts", "testing", "e2e", "docker", "ci", "docs", "deps", "scripts"],
    ],
    "subject-case": [2, "never", ["pascal-case", "upper-case"]],
    "body-max-line-length": [1, "always", 100],
  },
};
