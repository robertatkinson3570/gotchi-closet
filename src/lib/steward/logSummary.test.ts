// src/lib/steward/logSummary.test.ts
import { describe, it, expect } from "vitest";
import { summarizeWeek } from "./logSummary";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("summarizeWeek", () => {
  it("sums run actions within the last 7 days and tracks the last run", () => {
    const log = [
      { action: "run", detail: "pet:2 channel:1 claim:0", txHash: "0x1", ts: NOW - DAY },
      { action: "run", detail: "pet:1 channel:0 claim:3", txHash: "0x2", ts: NOW - 2 * DAY },
      { action: "run", detail: "pet:5 channel:5 claim:5", txHash: "0x3", ts: NOW - 10 * DAY }, // older than a week
      { action: "error", detail: "boom", txHash: null, ts: NOW - 1 }, // not a run
    ];
    const s = summarizeWeek(log, NOW);
    expect(s.runs).toBe(2);
    expect(s.pet).toBe(3);
    expect(s.channel).toBe(1);
    expect(s.claim).toBe(3);
    expect(s.lastRunTs).toBe(NOW - DAY); // newest run, even if >7d ones exist
  });

  it("handles an empty log", () => {
    expect(summarizeWeek([], NOW)).toEqual({ runs: 0, pet: 0, channel: 0, claim: 0, lastRunTs: null });
  });
});
