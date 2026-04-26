/**
 * Auto-renew subscription pricing.
 *
 * MUST stay in sync with the frontend SUBSCRIPTION_TIERS in
 * `src/components/lending/ListLendingModal.tsx`. The backend verifies any
 * paymentTxHash routes the right GHST amount to the operator wallet — if the
 * UI charges 4.5 GHST for 6 months and we expect 5 here, the user's payment
 * gets rejected.
 *
 * 1 GHST/month base, with multi-month discounts to encourage upfront commit.
 */

export type SubscriptionTier = {
  months: number;
  priceGhst: number;
  discountPct: number;
};

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { months: 1, priceGhst: 1, discountPct: 0 },
  { months: 3, priceGhst: 2.5, discountPct: 17 },
  { months: 6, priceGhst: 4.5, discountPct: 25 },
  { months: 12, priceGhst: 8, discountPct: 33 },
];

export function tierFor(months: number): SubscriptionTier | null {
  return SUBSCRIPTION_TIERS.find((t) => t.months === months) ?? null;
}

// 18-decimal GHST → wei. String-based to avoid float drift on 2.5 / 4.5.
export function ghstToWei(ghst: number): bigint {
  const [whole, frac = ""] = String(ghst).split(".");
  const fracPad = (frac + "000000000000000000").slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(fracPad);
}

export function expectedWeiForMonths(months: number): bigint | null {
  const tier = tierFor(months);
  if (!tier) return null;
  return ghstToWei(tier.priceGhst);
}
