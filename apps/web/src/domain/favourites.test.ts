import { describe, expect, it } from "vitest";
import {
  batchesOf,
  type Favourite,
  type FavouriteLookup,
  reconcileFavourites,
  showsRefreshCostNotice,
} from "./favourites.ts";

const favourite = (n: number): Favourite => ({ nodeId: `R_${n}`, nameWithOwner: `acme/repo-${n}` });
const found = (nodeId: string, nameWithOwner: string): FavouriteLookup => ({
  kind: "found",
  nodeId,
  nameWithOwner,
  openCount: 2,
  pullRequests: [],
});

describe("batches (FR-4.5)", () => {
  it("splits 60 favourites into 25, 25 and 10, keeping their order", () => {
    const ids = Array.from({ length: 60 }, (_, i) => i);
    const batches = batchesOf(ids);
    expect(batches.map((b) => b.length)).toEqual([25, 25, 10]);
    expect(batches.flat()).toEqual(ids);
  });

  it("makes no batch for no favourites", () => {
    expect(batchesOf([])).toEqual([]);
  });
});

describe("reconcile (FR-4.7, AC-4.4)", () => {
  it("a renamed node id takes its new name, and asks to be saved", () => {
    const { statuses, renamed } = reconcileFavourites(
      [favourite(1), favourite(2)],
      [found("R_1", "acme/renamed"), found("R_2", "acme/repo-2")],
    );
    expect(renamed).toBe(true);
    expect(statuses.map((s) => [s.state, s.favourite.nameWithOwner])).toEqual([
      ["available", "acme/renamed"],
      ["available", "acme/repo-2"],
    ]);
  });

  it("a node that no longer resolves is unavailable, keeping its last name", () => {
    const { statuses, renamed } = reconcileFavourites(
      [favourite(1)],
      [{ kind: "missing", nodeId: "R_1" }],
    );
    expect(renamed).toBe(false);
    expect(statuses).toEqual([{ state: "unavailable", favourite: favourite(1) }]);
  });

  it("an unreadable or not yet refreshed favourite is pending, not unavailable", () => {
    const { statuses } = reconcileFavourites(
      [favourite(1), favourite(2)],
      [{ kind: "unknown", nodeId: "R_1" }],
    );
    expect(statuses.map((s) => s.state)).toEqual(["pending", "pending"]);
  });

  it("an unchanged refresh asks for no save", () => {
    expect(reconcileFavourites([favourite(1)], [found("R_1", "acme/repo-1")]).renamed).toBe(false);
  });
});

describe("refresh cost notice (FR-4.8)", () => {
  it("shows above 50 favourites only", () => {
    expect(showsRefreshCostNotice(50)).toBe(false);
    expect(showsRefreshCostNotice(51)).toBe(true);
  });
});
