import { describe, it, expect } from "vitest";
import { chooseUrl, STALE_BLOCK_THRESHOLD, type Health } from "./subgraphFailover";

const P = "https://primary.example";
const B = "https://backup.example";
const h = (
  url: string,
  block: number | null,
  ok = true,
  hasErrors = false
): Health => ({ url, ok, hasErrors, block });

describe("chooseUrl", () => {
  it("uses primary when no backup is configured", () => {
    expect(chooseUrl(h(P, 100), null)).toBe(P);
    expect(chooseUrl(h(P, null, false), null)).toBe(P); // even if primary is down
  });

  it("keeps primary when both are current (within threshold)", () => {
    expect(chooseUrl(h(P, 1000), h(B, 1000))).toBe(P);
    // backup ahead by exactly the threshold is still within tolerance
    expect(chooseUrl(h(P, 1000), h(B, 1000 + STALE_BLOCK_THRESHOLD))).toBe(P);
  });

  it("fails over when primary is silently stalled (backup leads beyond threshold)", () => {
    expect(chooseUrl(h(P, 1000), h(B, 1000 + STALE_BLOCK_THRESHOLD + 1))).toBe(B);
  });

  it("fails over when primary is unreachable and backup is up", () => {
    expect(chooseUrl(h(P, null, false), h(B, 1000))).toBe(B);
  });

  it("fails over when primary has indexing errors", () => {
    expect(chooseUrl(h(P, 1000, true, true), h(B, 1000))).toBe(B);
  });

  it("keeps primary when the backup is the stale/down one", () => {
    expect(chooseUrl(h(P, 2000), h(B, 1000))).toBe(P); // backup behind
    expect(chooseUrl(h(P, 1000), h(B, null, false))).toBe(P); // backup down
  });

  it("when neither is reachable, picks the higher block (least stale)", () => {
    expect(chooseUrl(h(P, 800, false), h(B, 900, false))).toBe(B);
    expect(chooseUrl(h(P, 900, false), h(B, 800, false))).toBe(P);
  });
});
