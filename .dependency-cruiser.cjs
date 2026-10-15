/**
 * THE ARCHITECTURE CONTRACT.
 *
 * This file is the machine-enforced version of docs/conventions/dependency-rules.md.
 * It is protected by CODEOWNERS: an AI agent may propose changes here, but cannot
 * merge them without human review. Weakening a rule requires an ADR.
 *
 * Every rule below is `severity: 'error'` on purpose. Warnings get ignored;
 * that is precisely the failure mode this repository exists to prevent.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------
    // Frontend layering.
    // ---------------------------------------------------------------
    {
      name: "web-domain-is-pure",
      comment:
        "apps/web/src/domain must be framework-free: no React, no data fetching, no router. Pure " +
        "model code that can be unit-tested with zero setup.",
      severity: "error",
      from: { path: "^apps/web/src/domain" },
      to: {
        dependencyTypes: ["npm"],
        // `to.path` matches the RESOLVED file (node_modules/.pnpm/react@x/node_modules/
        // react/index.js), not the specifier, so anchor on the package directory.
        path: "(^|/)node_modules/(react|react-dom|@tanstack)/",
      },
    },
    {
      name: "web-domain-no-zod",
      comment:
        "apps/web/src/domain must not import Zod. Zod guards the GitHub boundary in " +
        "infrastructure; domain invariants are branded types and factory functions returning " +
        "Result (ADR-0015). Fix: move the schema to apps/web/src/infrastructure and map the " +
        "parsed value to a domain type there.",
      severity: "error",
      from: { path: "^apps/web/src/domain" },
      to: { dependencyTypes: ["npm"], path: "(^|/)node_modules/zod/" },
    },
    {
      name: "web-application-no-infrastructure",
      comment:
        "apps/web/src/application defines ports and never imports adapters (ADR-0015). Fix: " +
        "declare the interface in application/, implement it in infrastructure/, and wire the " +
        "adapter in at the composition root.",
      severity: "error",
      from: { path: "^apps/web/src/application" },
      to: { path: "^apps/web/src/infrastructure" },
    },
    {
      name: "web-ui-is-presentational",
      comment:
        "apps/web/src/ui holds presentational components only. It must not fetch data or import " +
        "infrastructure. Pass data in via props so components stay trivially testable.",
      severity: "error",
      from: { path: "^apps/web/src/ui" },
      to: { path: "^apps/web/src/(infrastructure|features)" },
    },
    {
      name: "web-no-direct-fetch",
      comment:
        "Only apps/web/src/infrastructure may talk to the network. Features and UI go through the " +
        "API port so the transport stays swappable and mockable.",
      severity: "error",
      from: { path: "^apps/web/src/(domain|application|ui)" },
      to: { dependencyTypes: ["npm"], path: "(^|/)node_modules/(axios|ky|openapi-fetch)/" },
    },

    // ---------------------------------------------------------------
    // General hygiene.
    // ---------------------------------------------------------------
    {
      name: "not-to-unresolvable",
      comment:
        "Depends on a module that cannot be resolved. Usually a typo, a missing " +
        "dependency, or — importantly — a package importing something it is not " +
        "allowed to depend on: pnpm's isolated node_modules means the import does " +
        "not resolve AT ALL from there. Without this rule such an import is invisible " +
        "to the npm-dependency rules below, which is exactly how a boundary check can " +
        "pass while the boundary is broken.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-circular",
      comment:
        "Circular dependencies make code untestable in isolation and confuse both humans and " +
        "agents about ownership. Break the cycle by extracting the shared piece downward.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Unreachable modules are dead code. Delete them or wire them up.",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "(^|/)(tsconfig|vite\\.config|vitest\\.config|playwright\\.config)",
          // Test helpers kept for upcoming tests; nothing imports them yet.
          "^apps/web/tests/determinism\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-dev-dep-in-src",
      comment:
        "Production source must not import a devDependency — it builds locally and fails in the " +
        "container.",
      severity: "error",
      from: { path: "^(apps|packages)/[^/]+/src", pathNot: "\\.(test|spec)\\.(ts|tsx)$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "not-to-deprecated",
      comment: "Depends on a deprecated npm package.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    // Generated output must never be cruised: the emitted .d.ts files reference
    // source paths and bundler-resolved packages that do not resolve from their
    // own location, which produces pure noise.
    // NOTE: node_modules must NOT be listed here. `exclude` removes modules from
    // the graph entirely, which would delete the npm edges the
    // rules above depend on. `doNotFollow` (below) is the correct mechanism: it
    // keeps the edge but does not descend into the package.
    exclude: { path: "(^|/)(dist|dist-types|coverage)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" },
      text: { highlightFocused: true },
    },
  },
};
