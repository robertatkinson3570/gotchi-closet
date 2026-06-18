import { describe, expect, it } from "vitest";
import { poleFor, intensityFor } from "./personality";
import { buildPersonality } from "./personality";
import type { PersonalityInput } from "./types";

const base = (over: Partial<PersonalityInput> = {}): PersonalityInput => ({
  name: "SteelFang",
  numericTraits: [50, 50, 50, 50, 0, 0],
  kinship: 50,
  level: 1,
  ...over,
});

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

describe("buildPersonality", () => {
  it("high BRN yields a galaxy-brained trait line with its value as the reason", () => {
    const p = buildPersonality(base({ numericTraits: [50, 50, 50, 96, 0, 0] }));
    const brn = p.traitLines.find((t) => t.reason === "BRN 96");
    expect(brn).toBeDefined();
    expect(brn!.label.toLowerCase()).toContain("galaxy");
  });

  it("low SPK is still a (cute) ghost — toneWords carry warmth, not absence of ghostliness", () => {
    const p = buildPersonality(base({ numericTraits: [50, 50, 6, 50, 0, 0] }));
    expect(p.toneWords.join(" ").toLowerCase()).toMatch(/warm|cute|friendly/);
  });

  it("reads equipped (withSets) traits over base, and flags the wearable shift", () => {
    const p = buildPersonality(
      base({ numericTraits: [50, 50, 50, 50, 0, 0], withSetsNumericTraits: [78, 50, 50, 50, 0, 0] })
    );
    expect(p.traitLines.some((t) => t.reason === "NRG 78")).toBe(true);
    expect(p.traitLines.some((t) => /wearable|set|\+\d+ NRG/i.test(`${t.label} ${t.reason}`))).toBe(true);
  });

  it("high kinship reads devoted; low kinship reads aloof", () => {
    const devoted = buildPersonality(base({ kinship: 1500 }));
    const aloof = buildPersonality(base({ kinship: 50 }));
    expect(devoted.toneWords).toContain("devoted");
    expect(aloof.toneWords).toContain("aloof");
  });
});
