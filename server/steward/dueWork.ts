// server/steward/dueWork.ts
// Pure due-work computation for one Steward enrollment. No I/O: the caller supplies a
// ChainSnapshot (on-chain reads) and `now`, so this is fully deterministic + unit-tested.
// Cooldown constants mirror src/lib/lending/contracts.ts; kept local so this server module
// does not pull the src "@/..." import graph. The Plan-2 runner still simulateContract's
// every action before submitting, so these filters are a best-effort gas-saver, not the
// final safety gate.

export const PET_COOLDOWN_SEC = 12 * 60 * 60;
export const RESERVOIR_COOLDOWN_SEC = 8 * 60 * 60;
export const CLAIM_DUST_MIN = 10n ** 18n; // 1 whole token in any reservoir before it's worth a claim
export const CHANNEL_COOLDOWN_SEC_BY_ALTAR: Record<number, number> = {
  1: 24 * 3600, 2: 18 * 3600, 3: 12 * 3600, 4: 10 * 3600, 5: 8 * 3600,
  6: 4 * 3600, 7: 3 * 3600, 8: 2 * 3600, 9: 1 * 3600,
};

// lentOut: the owner rented this gotchi out. It can still be PETTED (interact is fine), but
// it CANNOT channel — channelAlchemica reverts "Gotchi CANNOT have active listing for lending"
// — so it's excluded from channeler selection below.
export interface GotchiState { id: number; lastInteracted: number; lastChanneled: number; lentOut?: boolean; kinship?: number; }
export interface ParcelState {
  id: number; altarLevel: number; lastChanneled: number; lastClaimed: number; claimable: bigint[];
}
export interface ChainSnapshot { gotchis: GotchiState[]; parcels: ParcelState[]; }
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }

export interface ChannelAssignment { parcelId: number; gotchiId: number; lastChanneled: number; }
export interface WorkPlan { pet: number[]; channel: ChannelAssignment[]; claim: number[]; }

export function computeWork(chores: Chores, snap: ChainSnapshot, now: number): WorkPlan {
  const pet = chores.pet
    ? snap.gotchis.filter((g) => now - g.lastInteracted >= PET_COOLDOWN_SEC).map((g) => g.id)
    : [];

  const claim = chores.claim
    ? snap.parcels
        .filter((p) => now - p.lastClaimed >= RESERVOIR_COOLDOWN_SEC)
        .filter((p) => p.claimable.some((v) => v >= CLAIM_DUST_MIN))
        .map((p) => p.id)
    : [];

  const channel: ChannelAssignment[] = [];
  if (chores.channel) {
    // Same rotation as Land Management's channel-all: pair the highest-kinship gotchi with the
    // highest-level altar, then the next, until we run out of ready gotchis or parcels.
    const altared = snap.parcels.filter((p) => p.altarLevel > 0).sort((a, b) => b.altarLevel - a.altarLevel);
    const byKinship = [...snap.gotchis].sort((a, b) => (b.kinship ?? 0) - (a.kinship ?? 0));
    const used = new Set<number>();
    for (const p of altared) {
      const cd = CHANNEL_COOLDOWN_SEC_BY_ALTAR[p.altarLevel] ?? RESERVOIR_COOLDOWN_SEC;
      const g = byKinship.find((g) => !used.has(g.id) && !g.lentOut && now - g.lastChanneled >= cd);
      if (!g) continue; // no free, off-cooldown, non-lent gotchi left for this parcel
      used.add(g.id);
      channel.push({ parcelId: p.id, gotchiId: g.id, lastChanneled: g.lastChanneled });
    }
  }

  return { pet, channel, claim };
}

export function isEmpty(w: WorkPlan): boolean {
  return w.pet.length === 0 && w.channel.length === 0 && w.claim.length === 0;
}
