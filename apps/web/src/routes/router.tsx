import {
  type RouterHistory,
  Outlet,
  createBrowserHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useT } from "../application/i18n.tsx";
import { SignInPage } from "../features/auth/SignInPage.tsx";
import { HomePage } from "../features/home/HomePage.tsx";
import { PrPanel } from "../features/pr/PrPanel.tsx";
import { RepoPage } from "../features/repo/RepoPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { AppShell } from "../features/shell/AppShell.tsx";

/**
 * Code-based routes rather than file-based.
 *
 * File-based routing requires a generated `routeTree.gen.ts` that must exist
 * before typecheck, which adds an ordering constraint to every build and CI run
 * and produces a file agents must never hand-edit. Code-based routes are equally
 * type-safe and keep the build a single, obvious step. See ADR-0003.
 *
 * To add a screen: create the component under features/, declare a `createRoute`
 * below with `getParentRoute: () => appRoute` (so it renders inside the shell and
 * requires an account), and add it to `addChildren`. Three explicit steps, no generation.
 */

interface RouterContext {
  /** Supplied by the composition root (main.tsx) from the account store. */
  readonly hasAccount: () => boolean;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: function NotFound() {
    return <p>{useT()("notFound")}</p>;
  },
});

/** Sign-in stands alone, outside the shell: there is no account to show a sidebar for. */
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: function SignInRoute() {
    const navigate = useNavigate();
    return <SignInPage onContinue={() => void navigate({ to: "/" })} />;
  },
});

/** Pathless layout: every child renders inside the shell and needs an active account. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: ({ context }) => {
    if (!context.hasAccount()) throw redirect({ to: "/sign-in" });
  },
  component: AppShell,
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: HomePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: SettingsPage,
});

// TODO(T12): validate owner and name with domain/github-names.ts once it exists.
const repoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/repo/$owner/$name",
  component: function RepoRoute() {
    const { owner, name } = repoRoute.useParams();
    return (
      <RepoPage owner={owner} name={name}>
        <Outlet />
      </RepoPage>
    );
  },
});

/** The PR panel is a child of the repo route, so it renders over the repository page. */
const pullRoute = createRoute({
  getParentRoute: () => repoRoute,
  path: "pull/$number",
  beforeLoad: ({ params }) => {
    if (!/^[1-9]\d*$/u.test(params.number)) throw notFound();
  },
  component: function PullRoute() {
    const { owner, name, number } = pullRoute.useParams();
    return <PrPanel owner={owner} name={name} number={number} />;
  },
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  appRoute.addChildren([homeRoute, settingsRoute, repoRoute.addChildren([pullRoute])]),
]);

/** main.tsx uses the browser history; tests pass a memory history. */
export function createAppRouter(history: RouterHistory = createBrowserHistory()) {
  // The real context is passed to <RouterProvider> in main.tsx.
  return createRouter({ routeTree, history, context: { hasAccount: () => false } });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
