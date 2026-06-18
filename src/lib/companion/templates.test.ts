import { describe, expect, it } from "vitest";
import { templateReply } from "./templates";
import { buildPersonality } from "./personality";

const profile = buildPersonality({ name: "Wisp", numericTraits: [50, 50, 88, 50, 0, 0], kinship: 50, level: 1 });

describe("templateReply", () => {
  it("returns a deflect line when deflected=true", () => {
    const r = templateReply({ profile, message: "****", deflected: true });
    expect(r.toLowerCase()).toMatch(/language|spirit|ooo/);
  });

  it("returns a greeting for hello", () => {
    expect(templateReply({ profile, message: "hi there", deflected: false })).toBeTruthy();
  });

  it("is deterministic-safe: always returns a non-empty string", () => {
    expect(templateReply({ profile, message: "what is the forge", deflected: false }).length).toBeGreaterThan(0);
  });
});
