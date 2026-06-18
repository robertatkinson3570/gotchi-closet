import { ghstToWei } from "../lending/subscriptionPricing";

export interface CreditPack { priceGhst: number; credits: number; }

// Keep in sync with the client "Go Premium" UI.
export const CREDIT_PACKS: CreditPack[] = [
  { priceGhst: 500, credits: 5000 },
  { priceGhst: 1000, credits: 12000 },
];

export function creditPackForGhst(priceGhst: number): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.priceGhst === priceGhst) ?? null;
}

export function expectedWeiForPack(priceGhst: number): bigint | null {
  const p = creditPackForGhst(priceGhst);
  return p ? ghstToWei(p.priceGhst) : null;
}
