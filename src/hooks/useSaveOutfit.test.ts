import { describe, expect, it } from "vitest";
import { stepLabel } from "@/hooks/useSaveOutfit";
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
