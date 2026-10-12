# packages/contracts — agent rules

This package is the API contract of record. It is consumed by `apps/api`, `apps/web`,
and the OpenAPI generator, and it is independently publishable.

## Hard rules

1. **Zod is the only permitted dependency.** No utilities, no date libraries, no
   framework, no workspace packages. CI enforces this.
2. **No implementation.** Schemas, endpoint descriptors, and types only. No I/O,
   no business logic, no formatting helpers.
3. **Changing an existing schema is a breaking API change.** Adding an optional
   field is additive; removing a field, renaming one, narrowing a type, or making
   an optional field required is breaking.
4. After ANY change here, run `pnpm contract:generate` and commit
   `artifacts/openapi.json`. CI fails if it drifts.

## Why the rules are this strict

This package is the reason the backend can be replaced by .NET, Go, or Java. The
moment it depends on an app or grows implementation, it stops being a contract and
becomes shared code — and the two apps become coupled through it.

It will be under constant pressure to absorb "just one small helper". Resist it.
Put the helper in whichever app needs it, even if both do.

## Adding an endpoint

1. Add schemas in `src/<resource>/<resource>.schema.ts`.
2. Add descriptors with `defineEndpoint` in `src/<resource>/<resource>.endpoints.ts`.
3. Export both from `src/index.ts` and add the endpoints to `apiEndpoints`.
4. `pnpm contract:generate` and commit the spec.
5. Implement the route in `apps/api/src/http/` and the client call in
   `apps/web/src/infrastructure/`.

Endpoint descriptors are framework-neutral by design — importing `@hono/zod-openapi`
here would couple the contract to a TypeScript backend.
