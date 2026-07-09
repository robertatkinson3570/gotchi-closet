import { describe, expect, it } from "vitest";
import { forgeKind, forgeMetaSync } from "./forgeMeta";

describe("forgeMetaSync", () => {
  // Both anchors verified against the live dapp (activity feed + forge shop).
  it("resolves the live-verified core anchors", () => {
    expect(forgeMetaSync(1000000012)?.name).toBe("Mythical Body Core");
    expect(forgeMetaSync(1000000026)?.name).toBe("Common Head Core");
  });

  it("resolves materials and geodes", () => {
    expect(forgeMetaSync(1000000000)?.name).toBe("Alloy");
    expect(forgeMetaSync(1000000001)?.name).toBe("Essence");
    expect(forgeMetaSync(1000000002)?.name).toBe("Common Geode");
    expect(forgeMetaSync(1000000007)?.name).toBe("Godlike Geode");
  });

  it("covers the full core range and rejects ids outside it", () => {
    expect(forgeMetaSync(1000000008)?.name).toBe("Common Body Core");
    expect(forgeMetaSync(1000000043)?.name).toBe("Godlike Pet Core");
    expect(forgeMetaSync(1000000044)).toBeUndefined();
    expect(forgeMetaSync(374)).toBeUndefined(); // schematics resolve via wearable meta
  });

  it("classifies kinds", () => {
    expect(forgeKind(374)).toBe("schematic");
    expect(forgeKind(1000000000)).toBe("alloy");
    expect(forgeKind(1000000005)).toBe("geode");
    expect(forgeKind(1000000030)).toBe("core");
    expect(forgeKind(2000000000)).toBeNull();
  });
});
