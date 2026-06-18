import { describe, expect, it } from "vitest";
import { poleFor, intensityFor } from "./personality";

describe("poleFor", () => {
  it("returns low below center, high at/above center", () => {
    expect(poleFor(10)).toBe("low");
    expect(poleFor(49)).toBe("low");
    expect(poleFor(50)).toBe("high");
    expect(poleFor(90)).toBe("high");
  });
});

describe("intensityFor", () => {
  it("scales with distance from 50", () => {
    expect(intensityFor(50)).toBe("slightly"); // d=0
    expect(intensityFor(45)).toBe("slightly"); // d=5
    expect(intensityFor(30)).toBe("fairly");   // d=20
    expect(intensityFor(20)).toBe("very");     // d=30
    expect(intensityFor(2)).toBe("extremely"); // d=48
    expect(intensityFor(98)).toBe("extremely");
  });
});
