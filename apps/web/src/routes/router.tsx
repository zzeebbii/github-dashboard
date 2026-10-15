import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { SignInPage } from "../features/auth/SignInPage.tsx";
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

interface RouterContext {
  /** Supplied by the composition root (main.tsx) from the account store. */
  readonly hasAccount: () => boolean;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => {
    if (!context.hasAccount()) throw redirect({ to: "/sign-in" });
  },
  component: HomePage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: function SignInRoute() {
    const navigate = useNavigate();
    return <SignInPage onContinue={() => void navigate({ to: "/" })} />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, signInRoute]);

// The real context is passed to <RouterProvider> in main.tsx.
export const router = createRouter({ routeTree, context: { hasAccount: () => false } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
