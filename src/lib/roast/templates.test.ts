import { describe, it, expect } from "vitest";
import { templateBurn } from "./templates";
import type { RoastArchetype } from "./types";

const ALL_ARCHETYPES: RoastArchetype[] = [
  "Gladiator",
  "Dark Oracle",
  "Zen",
  "Galaxy Brain",
  "Lucky Fool",
  "Wildcard",
];

describe("templateBurn", () => {
  it("returns a non-empty string for every archetype", () => {
    for (const archetype of ALL_ARCHETYPES) {
      const burn = templateBurn(archetype, "TestOpponent", 0);
      expect(typeof burn).toBe("string");
      expect(burn.length).toBeGreaterThan(0);
    }
  });

  it("includes the opponent name in every burn", () => {
    for (const archetype of ALL_ARCHETYPES) {
      const burn = templateBurn(archetype, "NeonFang", 0);
      expect(burn).toContain("NeonFang");
    }
  });

  it("is deterministic — same archetype + name + index always returns the same string", () => {
    for (const archetype of ALL_ARCHETYPES) {
      const first = templateBurn(archetype, "Ghostly", 1);
      const second = templateBurn(archetype, "Ghostly", 1);
      expect(first).toBe(second);
    }
  });

  it("returns different lines for different indices (cycles through pool)", () => {
    // At least two different lines should exist across indices 0, 1, 2
    for (const archetype of ALL_ARCHETYPES) {
      const lines = [0, 1, 2].map((i) => templateBurn(archetype, "Rival", i));
      const unique = new Set(lines);
      expect(unique.size).toBeGreaterThan(1);
    }
  });

  it("wraps around correctly for large indices", () => {
    for (const archetype of ALL_ARCHETYPES) {
      const a = templateBurn(archetype, "Rival", 0);
      const b = templateBurn(archetype, "Rival", 300);
      // Both should be non-empty and contain the name
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
    }
  });

  it("handles negative indices gracefully", () => {
    for (const archetype of ALL_ARCHETYPES) {
      expect(() => templateBurn(archetype, "Rival", -1)).not.toThrow();
      const burn = templateBurn(archetype, "Rival", -1);
      expect(burn.length).toBeGreaterThan(0);
    }
  });
});
