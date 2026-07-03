// src/lib/steward/sessionSpec.ts
// THE session scope, shared by the client (issue) and server (submit) so the key's allowed
// actions are provably identical on both sides. A Steward session key may call ONLY the
// chosen chores' (target, selector) pairs — never transfer/sell/list/spend. This is the
// HARD custody invariant, expressed as ERC-7579 smart-session scoped actions.
import { toFunctionSelector, type Hex, type Address } from "viem";
import { getSudoPolicy } from "@rhinestone/module-sdk";

// Verified Base diamonds (same as server/steward/abi.ts + src/lib/lending/contracts.ts).
const AAVEGOTCHI_DIAMOND: Address = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";
const REALM_DIAMOND: Address = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372";

export const SELECTORS = {
  interact: toFunctionSelector("interact(uint256[])"),
  channelAlchemica: toFunctionSelector("channelAlchemica(uint256,uint256,uint256,bytes)"),
  claimAllAvailableAlchemica: toFunctionSelector("claimAllAvailableAlchemica(uint256[],uint256,bytes)"),
} as const;

export interface ChoresLike { pet: boolean; channel: boolean; claim: boolean; }

// An ERC-7579 smart-session scoped action (module-sdk shape): the session key may call ONLY this
// exact (target, selector); the sudo policy permits that one call and nothing else.
export interface SessionAction {
  actionTarget: Address;
  actionTargetSelector: Hex;
  actionPolicies: ReturnType<typeof getSudoPolicy>[];
}

// Map enabled chores -> the exact (target, selector) actions the session key may perform.
// Anything outside this set is rejected on-chain by the smart-sessions module.
export function sessionActions(chores: ChoresLike): SessionAction[] {
  const sudo = getSudoPolicy();
  const actions: SessionAction[] = [];
  if (chores.pet) actions.push({ actionTarget: AAVEGOTCHI_DIAMOND, actionTargetSelector: SELECTORS.interact as Hex, actionPolicies: [sudo] });
  if (chores.channel) actions.push({ actionTarget: REALM_DIAMOND, actionTargetSelector: SELECTORS.channelAlchemica as Hex, actionPolicies: [sudo] });
  if (chores.claim) actions.push({ actionTarget: REALM_DIAMOND, actionTargetSelector: SELECTORS.claimAllAvailableAlchemica as Hex, actionPolicies: [sudo] });
  return actions;
}
