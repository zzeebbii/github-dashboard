import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createInMemoryGitHub } from "../../tests/fakes/in-memory-github.ts";
import { GitHubProvider, useGitHub } from "./github-provider.tsx";

describe("useGitHub", () => {
  it("returns the provided port", async () => {
    const github = createInMemoryGitHub();

    const { result } = await renderHook(() => useGitHub(), {
      wrapper: ({ children }) => <GitHubProvider github={github}>{children}</GitHubProvider>,
    });

    expect(result.current).toBe(github);
  });

  it("explains a missing provider", async () => {
    await expect(renderHook(() => useGitHub())).rejects.toThrow(/inside <GitHubProvider>/);
  });
});
