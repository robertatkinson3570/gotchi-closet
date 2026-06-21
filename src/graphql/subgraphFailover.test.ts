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
    expect(chooseUrl(h(P, 100), null, 100)).toBe(P);
    expect(chooseUrl(h(P, null, false), null, 100)).toBe(P); // even if primary is down
  });

  it("uses primary when both are fresh", () => {
    expect(chooseUrl(h(P, 1000), h(B, 1000), 1000)).toBe(P);
  });

  it("fails over to backup when PRIMARY returns a stale _meta block", () => {
    const head = 1000;
    const primary = h(P, head - STALE_BLOCK_THRESHOLD - 10); // lag beyond threshold
    const backup = h(B, head - 1); // fresh
    expect(chooseUrl(primary, backup, head)).toBe(B);
  });

  it("fails over when primary errors (unreachable)", () => {
    expect(chooseUrl(h(P, null, false), h(B, 1000), 1000)).toBe(B);
  });

  it("fails over when primary has indexing errors", () => {
    expect(chooseUrl(h(P, 1000, true, true), h(B, 1000), 1000)).toBe(B);
  });

  it("keeps primary if it is fresh even when backup is also fresh", () => {
    const head = 1000;
    expect(chooseUrl(h(P, head - 1), h(B, head), head)).toBe(P);
  });

  it("when both are stale, picks the least-stale (higher block)", () => {
    const head = 1000;
    expect(chooseUrl(h(P, 800), h(B, 900), head)).toBe(B);
    expect(chooseUrl(h(P, 900), h(B, 800), head)).toBe(P);
  });

  it("without a known chain head, any reachable error-free block counts as fresh", () => {
    expect(chooseUrl(h(P, 500), h(B, 999))).toBe(P);
  });
});
