import { describe, it, expect } from "vitest";
import { buildLeaderboardQuery, LEADERBOARD_PAGE_SIZE } from "./leaderboard";

describe("buildLeaderboardQuery", () => {
  it("orders by kinship desc with summoned-only filter", () => {
    const q = buildLeaderboardQuery("kinship", 100, 0);
    expect(q).toContain("orderBy:kinship");
    expect(q).toContain("orderDirection:desc");
    expect(q).toContain("status:3");
    expect(q).toContain("first:100");
    expect(q).toContain("skip:0");
  });
  it("orders by experience for the XP board", () => {
    const q = buildLeaderboardQuery("experience", 100, 200);
    expect(q).toContain("orderBy:experience");
    expect(q).toContain("skip:200");
  });
  it("requests every field the page renders", () => {
    const q = buildLeaderboardQuery("kinship", 10, 0);
    for (const f of ["id", "gotchiId", "name", "kinship", "experience", "level", "lastInteracted", "owner { id }"]) {
      expect(q).toContain(f);
    }
  });
  it("exports a sane page size", () => {
    expect(LEADERBOARD_PAGE_SIZE).toBe(100);
  });
});
