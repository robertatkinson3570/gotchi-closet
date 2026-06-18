import { describe, it, expect } from "vitest";
import { parseVerdict } from "./judge";

const A_LINES = ["Your BRS is a tragedy.", "Even your wearables gave up."];
const B_LINES = ["I roast harder in idle.", "Short but devastating."];

describe("parseVerdict", () => {
  it("parses a clean JSON verdict", () => {
    const raw = JSON.stringify({
      winner: "a",
      aScore: 80,
      bScore: 60,
      verdict: "Side A dominated with sharper wit.",
    });
    const result = parseVerdict(raw, "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner).toBe("a");
    expect(result.aScore).toBe(80);
    expect(result.bScore).toBe(60);
    expect(result.verdict).toContain("wit");
  });

  it("parses JSON wrapped in ```json fences with surrounding prose", () => {
    const raw =
      "Here is my ruling:\n```json\n" +
      JSON.stringify({ winner: "b", aScore: 45, bScore: 72, verdict: "B wins decisively." }) +
      "\n```\nGood luck to both.";
    const result = parseVerdict(raw, "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner).toBe("b");
    expect(result.aScore).toBe(45);
    expect(result.bScore).toBe(72);
  });

  it("uses deterministic fallback for null input", () => {
    const result = parseVerdict(null, "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner === "a" || result.winner === "b").toBe(true);
    expect(result.aScore).toBeGreaterThanOrEqual(0);
    expect(result.aScore).toBeLessThanOrEqual(100);
    expect(result.bScore).toBeGreaterThanOrEqual(0);
    expect(result.bScore).toBeLessThanOrEqual(100);
    expect(typeof result.verdict).toBe("string");
    expect(result.verdict.length).toBeGreaterThan(0);
  });

  it("uses deterministic fallback for empty string", () => {
    const result = parseVerdict("", "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner === "a" || result.winner === "b").toBe(true);
  });

  it("uses deterministic fallback for malformed JSON", () => {
    const result = parseVerdict("{winner: broken}", "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner === "a" || result.winner === "b").toBe(true);
  });

  it("uses deterministic fallback when winner is not a or b", () => {
    const raw = JSON.stringify({ winner: "c", aScore: 50, bScore: 50, verdict: "hmm" });
    const result = parseVerdict(raw, "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner === "a" || result.winner === "b").toBe(true);
  });

  it("uses deterministic fallback when scores are out of range", () => {
    const raw = JSON.stringify({ winner: "a", aScore: 150, bScore: -10, verdict: "oops" });
    const result = parseVerdict(raw, "Alpha", "Beta", A_LINES, B_LINES);
    expect(result.winner === "a" || result.winner === "b").toBe(true);
  });

  it("fallback picks the longer-lines side", () => {
    const shortLines = ["Hi."];
    const longLines = [
      "Your on-chain stats are the digital equivalent of a participation trophy.",
      "I have seen portals with more ambition than your entire trait loadout.",
    ];
    const result = parseVerdict(null, "Alpha", "Beta", shortLines, longLines);
    expect(result.winner).toBe("b");
  });

  it("fallback ties go to a", () => {
    const result = parseVerdict(null, "Alpha", "Beta", ["ab"], ["ab"]);
    expect(result.winner).toBe("a");
  });

  it("is deterministic — same inputs always produce same output", () => {
    const r1 = parseVerdict(null, "Alpha", "Beta", A_LINES, B_LINES);
    const r2 = parseVerdict(null, "Alpha", "Beta", A_LINES, B_LINES);
    expect(r1).toEqual(r2);
  });

  it("never throws on bizarre input", () => {
    expect(() =>
      parseVerdict("🔥🔥🔥{{{", "A", "B", [], [])
    ).not.toThrow();
  });
});
