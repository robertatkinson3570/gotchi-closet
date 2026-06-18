import { describe, expect, it } from "vitest";
import { glowColor } from "./glow";
describe("glowColor", () => {
  it("high SPK → violet", () => {
    expect(glowColor({ name: "x", numericTraits: [50,50,90,50,0,0] })).toContain("168,85,247");
  });
  it("balanced → fuchsia", () => {
    expect(glowColor({ name: "x", numericTraits: [50,50,50,50,0,0] })).toContain("217,70,239");
  });
});
