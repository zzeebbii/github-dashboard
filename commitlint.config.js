/**
 * Conventional Commits, enforced.
 *
 * The commit type is not bookkeeping here: it drives CHANGELOG generation, and
 * the `!`/BREAKING CHANGE marker flags changes users must react to. See ADR-0012.
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
    "scope-enum": [1, "always", ["web", "e2e", "docker", "ci", "docs", "deps", "scripts"]],
    "subject-case": [2, "never", ["pascal-case", "upper-case"]],
    "body-max-line-length": [1, "always", 100],
  },
};
