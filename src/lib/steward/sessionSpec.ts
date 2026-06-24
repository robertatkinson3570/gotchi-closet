// src/lib/steward/sessionSpec.ts
// THE session scope, shared by the client (issue) and server (submit) so the key's allowed
// actions are provably identical on both sides. A Steward session key may call ONLY the
// chosen chores' (target, selector) pairs — never transfer/sell/list/spend. This is the
// HARD custody invariant, expressed as ERC-7579 smart-session scoped actions.
import { toFunctionSelector, type Hex, type Address } from "viem";
import type { Session } from "@rhinestone/sdk";

// The scoped-action shape, derived from the SDK's Session type (Action isn't re-exported at
// the package root).
type Action = NonNullable<Session["actions"]>[number];

// Verified Base diamonds (same as server/steward/abi.ts + src/lib/lending/contracts.ts).
const AAVEGOTCHI_DIAMOND: Address = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";
const REALM_DIAMOND: Address = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372";

export const SELECTORS = {
  interact: toFunctionSelector("interact(uint256[])"),
  channelAlchemica: toFunctionSelector("channelAlchemica(uint256,uint256,uint256,bytes)"),
  claimAllAvailableAlchemica: toFunctionSelector("claimAllAvailableAlchemica(uint256[],uint256,bytes)"),
} as const;

export interface ChoresLike { pet: boolean; channel: boolean; claim: boolean; }

// Map enabled chores -> the exact (target, selector) actions the session key may perform.
// Every action carries a sudo policy: allowed when target+selector match, nothing else.
export function sessionActions(chores: ChoresLike): Action[] {
  const sudo = [{ type: "sudo" as const }];
  const actions: Action[] = [];
  if (chores.pet) actions.push({ target: AAVEGOTCHI_DIAMOND, selector: SELECTORS.interact as Hex, policies: sudo });
  if (chores.channel) actions.push({ target: REALM_DIAMOND, selector: SELECTORS.channelAlchemica as Hex, policies: sudo });
  if (chores.claim) actions.push({ target: REALM_DIAMOND, selector: SELECTORS.claimAllAvailableAlchemica as Hex, policies: sudo });
  return actions;
}
