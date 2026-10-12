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
    // Backend hexagonal layering. Dependencies point strictly inward.
    // ---------------------------------------------------------------
    {
      name: "domain-is-pure",
      comment:
        "apps/api/src/domain must have ZERO dependencies: no framework, no Zod, no Node builtins, " +
        "no other layer. Domain invariants belong in constructors and branded types, not schemas. " +
        "Fix: move the dependency to application/ or infrastructure/ and inject it through a port.",
      severity: "error",
      from: { path: "^apps/api/src/domain" },
      to: { pathNot: "^apps/api/src/domain" },
    },
    {
      name: "application-only-domain",
      comment:
        "apps/api/src/application may import domain only. It DEFINES ports; it never imports the " +
        "adapters that implement them. Fix: declare a port interface here and bind the concrete " +
        "adapter in http/composition.ts.",
      severity: "error",
      from: { path: "^apps/api/src/application" },
      to: {
        path: "^apps/api/src/(infrastructure|http|config)",
      },
    },
    {
      name: "infrastructure-never-http",
      comment:
        "apps/api/src/infrastructure must not depend on the HTTP layer. Adapters are driven by the " +
        "application layer, not by Hono.",
      severity: "error",
      from: { path: "^apps/api/src/infrastructure" },
      to: { path: "^apps/api/src/http" },
    },
    {
      name: "no-framework-in-core",
      comment:
        "Hono (or any HTTP framework) must not leak into domain or application. Keeping the " +
        "framework confined to http/ is what makes the backend framework-replaceable.",
      severity: "error",
      from: { path: "^apps/api/src/(domain|application)" },
      to: { dependencyTypes: ["npm"], path: "^(hono|@hono)" },
    },
    {
      name: "no-orm-in-core",
      comment:
        "Drizzle must not leak into domain or application. Persistence belongs behind a repository " +
        "port in infrastructure/persistence. This is what contains the Drizzle 0.x risk.",
      severity: "error",
      from: { path: "^apps/api/src/(domain|application)" },
      to: { dependencyTypes: ["npm"], path: "^(drizzle-orm|drizzle-kit|postgres|pg)" },
    },
    {
      name: "no-zod-in-domain",
      comment:
        "domain/ must not import Zod. Zod guards BOUNDARIES; the type system guards the CORE. " +
        "Express invariants with branded types and private constructors so an invalid domain " +
        "object is unconstructible rather than merely detectable.",
      severity: "error",
      from: { path: "^apps/api/src/domain" },
      to: { dependencyTypes: ["npm"], path: "^zod" },
    },
    {
      name: "env-only-in-config",
      comment:
        "process.env may only be read in config/env.ts. Configuration must not leak into domain, " +
        "application, or infrastructure code — inject validated config instead.",
      severity: "error",
      from: { pathNot: "^apps/api/src/config/env\\.ts$" },
      to: { path: "^apps/api/src/config/env-raw" },
    },

    // ---------------------------------------------------------------
    // The frontend/backend boundary. This is the replaceability guarantee.
    // ---------------------------------------------------------------
    {
      name: "web-never-imports-api",
      comment:
        "apps/web must NEVER import from apps/api. The only permitted channel between them is " +
        "@kit/contracts plus the HTTP wire. This single rule is what keeps the backend replaceable " +
        "by .NET/Java/Go. See docs/guides/replacing-the-backend.md.",
      severity: "error",
      from: { path: "^apps/web" },
      to: { path: "^apps/api" },
    },
    {
      name: "api-never-imports-web",
      comment:
        "apps/api must never import from apps/web. The backend serves a contract, not a client.",
      severity: "error",
      from: { path: "^apps/api" },
      to: { path: "^apps/web" },
    },

    // ---------------------------------------------------------------
    // Contracts purity. The most likely place this architecture erodes.
    // ---------------------------------------------------------------
    {
      name: "contracts-are-schema-only",
      comment:
        "packages/contracts may import Zod and nothing else. It must never depend on an app, a " +
        "database, a framework, or a utility library. It is publishable standalone, and that is " +
        'what makes it the language-neutral contract of record. Resist adding "just one helper".',
      severity: "error",
      // `src` only: vitest.config.ts legitimately imports vitest.
      from: { path: "^packages/contracts/src" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer"],
        // Matches the RESOLVED path. pnpm resolves to
        // node_modules/.pnpm/zod@x.y.z/node_modules/zod/..., so anchoring on
        // "^zod" would never match and the rule would flag Zod itself.
        pathNot: "node_modules/zod/",
      },
    },
    {
      name: "contracts-never-import-apps",
      comment: "packages/contracts must not import any app or workspace package.",
      severity: "error",
      from: { path: "^packages/contracts" },
      to: { path: "^(apps|e2e)" },
    },

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
        path: "^(react|react-dom|@tanstack)",
      },
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
      to: { dependencyTypes: ["npm"], path: "^(axios|ky|openapi-fetch)" },
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
          "(^|/)(tsconfig|vite\\.config|vitest\\.config|drizzle\\.config|playwright\\.config)",
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
    // the graph entirely, which would delete the domain→zod style edges the npm
    // rules above depend on. `doNotFollow` (below) is the correct mechanism: it
    // keeps the edge but does not descend into the package.
    exclude: { path: "(^|/)(dist|dist-types|coverage|drizzle)/" },
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
