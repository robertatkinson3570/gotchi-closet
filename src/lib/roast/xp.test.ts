import { describe, it, expect } from "vitest";
import { xpForResult, WIN_XP, LOSS_XP } from "./xp";

describe("xpForResult", () => {
  it("returns WIN_XP (100) for a win", () => {
    expect(xpForResult({ result: "win" })).toBe(100);
  });

  it("returns LOSS_XP (20) for a loss", () => {
    expect(xpForResult({ result: "loss" })).toBe(20);
  });

  it("win XP is greater than 0", () => {
    expect(xpForResult({ result: "win" })).toBeGreaterThan(0);
  });

  it("loss XP is greater than 0", () => {
    expect(xpForResult({ result: "loss" })).toBeGreaterThan(0);
  });

  it("win XP equals the WIN_XP constant", () => {
    expect(xpForResult({ result: "win" })).toBe(WIN_XP);
  });

  it("loss XP equals the LOSS_XP constant", () => {
    expect(xpForResult({ result: "loss" })).toBe(LOSS_XP);
  });

  it("win XP is greater than loss XP", () => {
    expect(xpForResult({ result: "win" })).toBeGreaterThan(
      xpForResult({ result: "loss" })
    );
  });
});
