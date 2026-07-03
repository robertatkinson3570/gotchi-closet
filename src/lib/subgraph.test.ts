import { describe, it, expect } from "vitest";
import { coreSubgraphFetch, CORE_SUBGRAPH } from "./subgraph";
import { failoverFetch } from "@/graphql/subgraphFailover";

/**
 * Every direct consumer of the core subgraph must go through the failover
 * transport (raw `fetch(CORE_SUBGRAPH)` bypasses backup routing — that gap left
 * most of the app on a stalled Goldsky during the 2026-07 incident).
 */
describe("coreSubgraphFetch", () => {
  it("is the failover transport, not plain fetch", () => {
    expect(coreSubgraphFetch).toBe(failoverFetch);
  });

  it("core endpoint constant still points at the Goldsky primary", () => {
    expect(CORE_SUBGRAPH).toContain("goldsky.com");
    expect(CORE_SUBGRAPH).toContain("aavegotchi-core-base");
  });
});
