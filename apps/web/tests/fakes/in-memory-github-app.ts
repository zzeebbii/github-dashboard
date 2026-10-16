import {
  AuthError,
  type GitHubAppSignInPort,
  type SignInResult,
} from "../../src/application/auth.ts";

/** The `state` the fake accepts; any other callback is rejected like a forged one. */
export const GOOD_STATE = "fake-good-state";

/**
 * A `GitHubAppSignInPort` with no network and no navigation. `starts` records each redirect
 * begun, with its options; `searches` records each query string handed to `complete`.
 */
export function createInMemoryGitHubApp(result: SignInResult) {
  const calls = { starts: [] as { rememberMe: boolean }[], searches: [] as string[] };
  const port: GitHubAppSignInPort = {
    start(options) {
      calls.starts.push(options);
      return Promise.resolve();
    },
    complete(search) {
      calls.searches.push(search);
      return new URLSearchParams(search).get("state") === GOOD_STATE
        ? Promise.resolve(result)
        : Promise.reject(new AuthError("invalid-callback", "The sign-in callback was rejected."));
    },
  };
  return { port, calls };
}
