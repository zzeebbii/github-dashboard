import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { HomePage } from "../features/home/HomePage.tsx";

/**
 * Code-based routes rather than file-based.
 *
 * File-based routing requires a generated `routeTree.gen.ts` that must exist
 * before typecheck, which adds an ordering constraint to every build and CI run
 * and produces a file agents must never hand-edit. Code-based routes are equally
 * type-safe and keep the build a single, obvious step. See ADR-0003.
 *
 * To add a route: create the component under features/, declare a `createRoute`
 * below, and add it to `addChildren`. Three explicit steps, no generation.
 */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
