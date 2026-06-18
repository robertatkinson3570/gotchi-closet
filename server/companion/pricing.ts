import { ghstToWei } from "../lending/subscriptionPricing";

export interface CompanionTier { days: number; priceGhst: number; }

// Keep in sync with the client "Go Premium" UI (Task 17).
export const COMPANION_TIERS: CompanionTier[] = [
  { days: 30, priceGhst: 500 },
  { days: 90, priceGhst: 1000 },
];

export function companionTierFor(days: number): CompanionTier | null {
  return COMPANION_TIERS.find((t) => t.days === days) ?? null;
}

export function expectedWeiForTier(days: number): bigint | null {
  const t = companionTierFor(days);
  return t ? ghstToWei(t.priceGhst) : null;
}
