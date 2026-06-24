// server/steward/encode.ts
// Pure: turn a WorkPlan into concrete contract calls. claimAllAvailableAlchemica needs a
// gotchi the owner controls; we use the first channel assignment's gotchi if present, else
// the explicit opts.claimerGotchiId the runner supplies (the steward gotchi).
import { encodeFunctionData } from "viem";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND, PET_ABI, REALM_ABI } from "./abi";
import type { WorkPlan } from "./dueWork";

export interface Call { to: `0x${string}`; data: `0x${string}`; }

export function workPlanToCalls(plan: WorkPlan, opts: { claimerGotchiId?: number } = {}): Call[] {
  const calls: Call[] = [];

  if (plan.pet.length) {
    calls.push({
      to: AAVEGOTCHI_DIAMOND,
      data: encodeFunctionData({ abi: PET_ABI, functionName: "interact", args: [plan.pet.map(BigInt)] }),
    });
  }

  for (const a of plan.channel) {
    calls.push({
      to: REALM_DIAMOND,
      data: encodeFunctionData({
        abi: REALM_ABI,
        functionName: "channelAlchemica",
        args: [BigInt(a.parcelId), BigInt(a.gotchiId), BigInt(a.lastChanneled), "0x"],
      }),
    });
  }

  if (plan.claim.length) {
    const claimer = plan.channel[0]?.gotchiId ?? opts.claimerGotchiId;
    if (claimer === undefined) throw new Error("claim requires a claimer gotchi id");
    calls.push({
      to: REALM_DIAMOND,
      data: encodeFunctionData({
        abi: REALM_ABI,
        functionName: "claimAllAvailableAlchemica",
        args: [plan.claim.map(BigInt), BigInt(claimer), "0x"],
      }),
    });
  }

  return calls;
}
