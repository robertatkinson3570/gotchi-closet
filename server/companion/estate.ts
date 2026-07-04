import { upkeepFor } from "../steward/service";
import { snapshotFor } from "../steward/chain";

// A one-line summary of what upkeep is DUE across the owner's wallet (gotchis to channel, parcel
// reservoirs ready to empty, gotchis to pet), injected into chat context so Hermes answers
// "what needs doing / anything ready" from real chain state. null on failure.
export async function fetchEstateStatus(owner: string): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const r = await upkeepFor(owner, { snapshotFor }, now);
    const { pet, channel, claim } = r.summary;
    if (!pet && !channel && !claim) {
      return "Nothing is due right now — everything's on cooldown. Nothing to collect yet.";
    }
    const parts: string[] = [];
    if (channel) parts.push(`${channel} gotchi${channel === 1 ? "" : "s"} ready to channel`);
    if (claim) parts.push(`${claim} parcel reservoir${claim === 1 ? "" : "s"} ready to empty`);
    if (pet) parts.push(`${pet} gotchi${pet === 1 ? "" : "s"} ready to pet`);
    return `Work is due for the owner: ${parts.join(", ")}. If they say "collect" or "empty", run_upkeep handles it.`;
  } catch {
    return null;
  }
}
