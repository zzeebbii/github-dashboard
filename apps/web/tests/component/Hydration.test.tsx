import { useQuery } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { hydrateQueries, persistQueries } from "../../src/application/query-hydration.ts";
import { inMemoryCache } from "../fakes/in-memory-cache.ts";
import { renderWithProviders, testQueryClient } from "../render.tsx";

// A stand-in for the GitHub queries to come: the key is [store, accountId, ...parts].
const clock = { now: () => new Date("2026-01-01T00:00:00.000Z") };
const queryKey = ["prLists", "account-1", "home"];

function PrCount({ network }: { network: () => Promise<string> }) {
  const { data } = useQuery({ queryKey, queryFn: network });
  return <p>{data ?? "Loading"}</p>;
}

const noop = (): void => undefined;

function deferred() {
  let resolve: (value: string) => void = noop;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("cached data renders before the network responds, then the fresh result is written through", async () => {
  const cache = inMemoryCache(clock);
  await cache.put("account-1", "prLists", JSON.stringify(["home"]), { data: "3 cached PRs" });
  const client = testQueryClient();
  persistQueries(client, cache);
  await hydrateQueries(client, cache, { timeoutMs: 300 });
  const network = deferred();

  const screen = await renderWithProviders(<PrCount network={() => network.promise} />, {
    queryClient: client,
  });

  await expect.element(screen.getByText("3 cached PRs")).toBeInTheDocument();
  network.resolve("5 fresh PRs");
  await expect.element(screen.getByText("5 fresh PRs")).toBeInTheDocument();
  expect((await cache.get("account-1", "prLists", '["home"]'))?.data).toBe("5 fresh PRs");
});

test("a cache that never answers does not hold up hydration past its timeout", async () => {
  const cache = { ...inMemoryCache(clock), getAll: () => new Promise<never>(() => {}) };
  const started = performance.now();

  await hydrateQueries(testQueryClient(), cache, { timeoutMs: 50 });

  expect(performance.now() - started).toBeLessThan(1000);
});

test("queries outside the key convention are not persisted", async () => {
  const cache = inMemoryCache(clock);
  const client = testQueryClient();
  persistQueries(client, cache);

  await client.fetchQuery({ queryKey: ["settings"], queryFn: () => "x" });
  await client.fetchQuery({ queryKey: ["repos", 42], queryFn: () => "x" });

  expect(cache.entries.size).toBe(0);
});
