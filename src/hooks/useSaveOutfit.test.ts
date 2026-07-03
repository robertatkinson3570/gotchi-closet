import { describe, expect, it } from "vitest";
import { stepLabel, stepToWriteArgs } from "@/hooks/useSaveOutfit";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import type { SaveStep } from "@/lib/savePlan";

describe("stepLabel", () => {
  it("labels every step kind", () => {
    const steps: [SaveStep, string][] = [
      [{ kind: "buy", wearableId: 7, listingId: "1", priceInWei: "5", quantity: 1 }, "Buying wearable #7"],
      [{ kind: "resetSkillPoints" }, "Respec: resetting skill points"],
      [{ kind: "spendSkillPoints", values: [1, 0, 0, 0] }, "Respec: spending skill points"],
      [{ kind: "unequip", gotchiId: "200", slots16: [], stolen: [7] }, "Removing from gotchi #200"],
      [{ kind: "equip", gotchiId: "100", slots16: [] }, "Equipping gotchi #100"],
    ];
    for (const [step, label] of steps) expect(stepLabel(step)).toBe(label);
  });
});

describe("stepToWriteArgs (tx construction)", () => {
  const recipient = "0x1111111111111111111111111111111111111111" as const;
  const slots16 = [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it("buy → executeERC1155ListingToRecipient with BigInt listing/price and recipient", () => {
    const w = stepToWriteArgs(
      { kind: "buy", wearableId: 7, listingId: "555", priceInWei: "1000000000000000000", quantity: 1 },
      "100",
      recipient
    );
    expect(w.address).toBe(AAVEGOTCHI_DIAMOND_BASE);
    expect(w.functionName).toBe("executeERC1155ListingToRecipient");
    expect(w.args).toEqual([555n, AAVEGOTCHI_DIAMOND_BASE, 7n, 1n, 1000000000000000000n, recipient]);
  });

  it("resetSkillPoints → uint32 token id (Number, not BigInt)", () => {
    const w = stepToWriteArgs({ kind: "resetSkillPoints" }, "100", recipient);
    expect(w.address).toBe(AAVEGOTCHI_DIAMOND_BASE);
    expect(w.functionName).toBe("resetSkillPoints");
    expect(w.args).toEqual([100]);
  });

  it("spendSkillPoints → BigInt token id + int16[4] values", () => {
    const w = stepToWriteArgs({ kind: "spendSkillPoints", values: [2, 0, -1, 0] }, "100", recipient);
    expect(w.functionName).toBe("spendSkillPoints");
    expect(w.args).toEqual([100n, [2, 0, -1, 0]]);
  });

  it("unequip → equipWearables on the SOURCE gotchi with its remaining slots", () => {
    const w = stepToWriteArgs({ kind: "unequip", gotchiId: "200", slots16, stolen: [7] }, "100", recipient);
    expect(w.functionName).toBe("equipWearables");
    expect(w.args).toEqual([200n, slots16]);
  });

  it("equip → equipWearables on the TARGET gotchi with the desired slots", () => {
    const w = stepToWriteArgs({ kind: "equip", gotchiId: "100", slots16 }, "100", recipient);
    expect(w.functionName).toBe("equipWearables");
    expect(w.args).toEqual([100n, slots16]);
  });
});
