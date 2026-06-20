// Wisp pricing — shared by the in-app sell dialog (display) and the server
// (payment-amount validation). USD-denominated; paid in ETH/USDC on Base.
// gotchi-closet itself pays nothing (it's customer #1, used internally) — these
// tiers are for EXTERNAL developers/projects only.
// Pure module: no DOM, no env, no Date.now — safe to import on client and server.

export type WispPlan = "free" | "pro" | "studio";

export interface PlanInfo {
  id: WispPlan;
  name: string;
  usdPerMonth: number;
  tagline: string;
  features: string[];
}

export const WISP_PLANS: Record<Exclude<WispPlan, "free">, PlanInfo> = {
  pro: {
    id: "pro",
    name: "Pro",
    usdPerMonth: 29,
    tagline: "For indie devs & builders",
    features: [
      "Persistent memory — souls remember across sessions",
      "On-chain soul seals",
      "Up to 3 collections",
      "~25k requests / month",
      "Bring your own model (no LLM cost)",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    usdPerMonth: 199,
    tagline: "Power a whole collection",
    features: [
      "Everything in Pro",
      "Up to ~10k active souls",
      "Unlimited collections",
      "Priority support",
      "~250k requests / month",
    ],
  },
};

export const FREE_PLAN: PlanInfo = {
  id: "free",
  name: "Free",
  usdPerMonth: 0,
  tagline: "Bring your own model",
  features: [
    "Read + context tools (get_soul, get_persona, build_chat_context, get_roast_setup)",
    "1 collection",
    "~1k requests / day",
    "Stateless (no persistent memory)",
  ],
};

/** Per-seal on-chain micro-fee (one-time), in USD. */
export const PER_SEAL_USD = 2;

/** Prepaid billing periods (months) → discount fraction (longer = cheaper). */
export const PERIODS: { months: number; label: string; discount: number }[] = [
  { months: 1, label: "1 month", discount: 0 },
  { months: 3, label: "3 months", discount: 0.1 },
  { months: 12, label: "12 months", discount: 0.2 },
];

/** Total USD price for a paid plan over `months`, applying the period discount. Rounded to whole USD. */
export function priceUsd(plan: Exclude<WispPlan, "free">, months: number): number {
  const info = WISP_PLANS[plan];
  const period = PERIODS.find((p) => p.months === months);
  const discount = period?.discount ?? 0;
  return Math.round(info.usdPerMonth * months * (1 - discount));
}

/** Validate a (plan, months) pair against the allowed catalog. */
export function isValidPurchase(plan: string, months: number): plan is Exclude<WispPlan, "free"> {
  return (plan === "pro" || plan === "studio") && PERIODS.some((p) => p.months === months);
}
