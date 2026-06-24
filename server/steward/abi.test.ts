// server/steward/abi.test.ts
import { describe, it, expect } from "vitest";
import { toFunctionSelector } from "viem";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND, PET_ABI, REALM_ABI, CHORES } from "./abi";

describe("steward abi", () => {
  it("targets the verified Base diamonds", () => {
    expect(AAVEGOTCHI_DIAMOND).toBe("0xA99c4B08201F2913Db8D28e71d020c4298F29dBF");
    expect(REALM_DIAMOND).toBe("0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372");
  });

  it("exposes the three action selectors with their verified signatures", () => {
    // These signatures were confirmed present via DiamondLoupe facetAddress on Base 2026-06-23.
    const sig = (abi: readonly unknown[], name: string) =>
      toFunctionSelector((abi as any[]).find((f) => f.name === name));
    expect(sig(PET_ABI, "interact")).toBe(toFunctionSelector("interact(uint256[])"));
    expect(sig(REALM_ABI, "channelAlchemica")).toBe(
      toFunctionSelector("channelAlchemica(uint256,uint256,uint256,bytes)")
    );
    expect(sig(REALM_ABI, "claimAllAvailableAlchemica")).toBe(
      toFunctionSelector("claimAllAvailableAlchemica(uint256[],uint256,bytes)")
    );
  });

  it("lists the three chores", () => {
    expect([...CHORES]).toEqual(["pet", "channel", "claim"]);
  });
});
