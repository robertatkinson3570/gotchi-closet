import { describe, it, expect } from "vitest";
import { timeAgo } from "./format";

describe("timeAgo", () => {
  const NOW_MS = 1_800_000_000_000; // fixed "now" so tests are deterministic
  const nowSec = NOW_MS / 1000;

  it("returns None for zero/invalid timestamps", () => {
    expect(timeAgo(0, NOW_MS)).toBe("None");
    expect(timeAgo(NaN, NOW_MS)).toBe("None");
    expect(timeAgo(-5, NOW_MS)).toBe("None");
  });
  it("formats under a minute as 'just now'", () => {
    expect(timeAgo(nowSec - 30, NOW_MS)).toBe("just now");
  });
  it("formats minutes", () => {
    expect(timeAgo(nowSec - 5 * 60, NOW_MS)).toBe("5m ago");
  });
  it("formats hours", () => {
    expect(timeAgo(nowSec - 3 * 3600, NOW_MS)).toBe("3h ago");
  });
  it("formats days", () => {
    expect(timeAgo(nowSec - 2 * 86400, NOW_MS)).toBe("2d ago");
  });
  it("clamps future timestamps to 'just now'", () => {
    expect(timeAgo(nowSec + 999, NOW_MS)).toBe("just now");
  });
});
