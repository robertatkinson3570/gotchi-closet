import { describe, expect, it } from "vitest";
import { retrieveLore } from "./knowledge";

describe("retrieveLore", () => {
  it("returns the kinship snippet when asked about petting", () => {
    const hits = retrieveLore("how do i raise my kinship by petting?");
    expect(hits.join(" ").toLowerCase()).toContain("kinship");
  });

  it("returns the alchemica snippet for FUD/FOMO/ALPHA/KEK", () => {
    const hits = retrieveLore("what is ALPHA and KEK?");
    expect(hits.join(" ").toLowerCase()).toContain("alchemica");
  });

  it("caps results at 4 snippets and returns [] for unrelated chatter", () => {
    expect(retrieveLore("nice weather today").length).toBe(0);
    expect(retrieveLore("ghst forge wearable baazaar portal kinship").length).toBeLessThanOrEqual(4);
  });
});
