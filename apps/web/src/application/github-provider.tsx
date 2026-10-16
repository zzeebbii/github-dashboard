import { type ReactNode, createContext, useContext } from "react";
import type { GitHubReadPort } from "./github.ts";

const GitHubContext = createContext<GitHubReadPort | null>(null);

/** Production wires the GitHub adapter; tests wire tests/fakes/in-memory-github.ts. */
export function GitHubProvider({
  github,
  children,
}: {
  readonly github: GitHubReadPort;
  readonly children: ReactNode;
}) {
  return <GitHubContext value={github}>{children}</GitHubContext>;
}

export function useGitHub(): GitHubReadPort {
  const github = useContext(GitHubContext);
  if (github === null) {
    throw new Error(
      "useGitHub must be used inside <GitHubProvider>. In tests, use renderWithProviders() from tests/render.tsx.",
    );
  }
  return github;
}
