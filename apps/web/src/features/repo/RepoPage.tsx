import type { ReactNode } from "react";

/**
 * Placeholder for `/repo/$owner/$name`; the real page is T21. `children` is where the PR
 * panel route renders, over this page.
 */
export function RepoPage({
  owner,
  name,
  children,
}: {
  owner: string;
  name: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h1>
        {owner} / {name}
      </h1>
      {children}
    </>
  );
}
