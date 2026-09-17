// Wisp pricing, shared by the in-app sell dialog (display) and the server
// (payment-amount validation). USD-denominated; paid in GHST at the live rate, ETH or USDC on Base.
// GVR carries the same catalogue (packages/shared/src/wispPricing.ts); the two must agree.
// gotchi-closet itself pays nothing (it's customer #1, used internally); these
// tiers are for EXTERNAL developers/projects only.
// Pure module: no DOM, no env, no Date.now; safe to import on client and server.

export type WispPlan = "free" | "pro" | "studio" | "holder";
export type WispAsset = "eth" | "usdc" | "ghst";
export type PaidPlan = Exclude<WispPlan, "free">;

export interface PlanInfo {
  id: WispPlan;
  name: string;
  usdPerMonth: number;
  tagline: string;
  features: string[];
  /** The whole 12-month period in USD, when the plan has an annual price (replaces usdPerMonth × 12 × the discount). */
  annualUsd?: number;
}

export const WISP_PLANS: Record<Exclude<WispPlan, "free">, PlanInfo> = {
  // THE HOLDER PLAN (GVR, 2026-08-30): a gotchi holder who does not own an LLM key.
  // Metered by gotchis + desk calls, not MCP requests; GHST at the live rate by default.
  holder: {
    id: "holder",
    name: "Holder",
    usdPerMonth: 9,
    // THE ANNUAL HOLDER (GVR gotchi-agent-program.md §8.1): $69 for 12 months. GVR quotes GHST
    // from its own copy of this catalogue, so the two priceUsd copies must agree to the dollar.
    annualUsd: 69,
    tagline: "Your gotchi goes to work",
    features: [
      "The desk in your gotchi's own voice",
      "The interview in natural language",
      "One action a day, one tap, your signature",
      "AUTOPILOT for 1 gotchi (+$3 each more)",
      "The Steward and the Lending Desk",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    usdPerMonth: 29,
    tagline: "For indie devs & builders",
    features: [
      "Persistent memory: souls remember across sessions",
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
/** Holder: each autopilot gotchi beyond the first, per month, in USD. */
export const GHOST_ADDON_USD = 3;
export const MAX_EXTRA_GHOSTS = 4;

/** Prepaid billing periods (months) → discount fraction (longer = cheaper). */
export const PERIODS: { months: number; label: string; discount: number }[] = [
  { months: 1, label: "1 month", discount: 0 },
  { months: 3, label: "3 months", discount: 0.1 },
  { months: 12, label: "12 months", discount: 0.2 },
];

/** Total USD price for a paid plan over `months`, applying the period discount. Rounded to whole USD.
 *  A plan with an annual price pays it for 12 months; each extra ghost still costs its monthly add-on
 *  over 12 months at the 12-month discount (the same branch, term for term, as GVR's copy). */
export function priceUsd(plan: Exclude<WispPlan, "free">, months: number, extraGhosts = 0): number {
  const info = WISP_PLANS[plan];
  const period = PERIODS.find((p) => p.months === months);
  const discount = period?.discount ?? 0;
  const ghosts = plan === "holder" ? Math.max(0, Math.min(MAX_EXTRA_GHOSTS, Math.floor(extraGhosts) || 0)) : 0;
  if (months === 12 && info.annualUsd !== undefined) {
    return Math.round(info.annualUsd + ghosts * GHOST_ADDON_USD * 12 * (1 - discount));
  }
  return Math.round((info.usdPerMonth + ghosts * GHOST_ADDON_USD) * months * (1 - discount));
}

/** THE YEARLY SAVING (GVR docs/briefs/wisp-renewals.md §1): what a plan with an annual price saves
 *  over twelve months at its monthly price, derived from the catalogue (Holder: 9 × 12 − 69 = 39).
 *  Undefined for a plan with no annual price. Every "save $N" line reads this; none is typed.
 *  GVR's copy (packages/shared/src/wispPricing.ts) carries the same helper. */
export function annualSavingUsd(plan: PaidPlan): number | undefined {
  const info = WISP_PLANS[plan];
  if (info.annualUsd === undefined) return undefined;
  return info.usdPerMonth * 12 - info.annualUsd;
}

/** The period the dialog opens on for a plan: the year for a plan with an annual price, one month
 *  for every other plan (same rule as GVR's picker). */
export function defaultMonths(plan: PaidPlan): number {
  return annualSavingUsd(plan) !== undefined ? 12 : 1;
}

/** The period after the player switches plan: the new plan's default, unless they already picked a
 *  period by hand, which is kept. */
export function monthsOnPlanSwitch(next: PaidPlan, current: number, pickedByHand: boolean): number {
  return pickedByHand ? current : defaultMonths(next);
}

/** The period chip's label. The 12-month chip names the annual price on a plan that has one
 *  ("12 months ($69, best value)"); every other chip shows its discount. Same wording as GVR's picker. */
export function periodChipLabel(period: { months: number; label: string; discount: number }, plan: PaidPlan): string {
  const annualUsd = WISP_PLANS[plan].annualUsd;
  if (period.months === 12 && annualUsd !== undefined) return `${period.label} ($${annualUsd}, best value)`;
  return `${period.label}${period.discount ? ` (−${Math.round(period.discount * 100)}%)` : ""}`;
}

/** The assets a plan can be paid in. Holder is GHST-first at the live rate; every plan keeps ETH/USDC. */
export const ASSETS_FOR: Record<PaidPlan, readonly WispAsset[]> = {
  holder: ["ghst", "eth", "usdc"],
  pro: ["ghst", "eth", "usdc"],
  studio: ["ghst", "eth", "usdc"],
};

/** Validate a (plan, months) pair against the allowed catalog. */
export function isValidPurchase(plan: string, months: number): plan is Exclude<WispPlan, "free"> {
  return (plan === "pro" || plan === "studio" || plan === "holder") && PERIODS.some((p) => p.months === months);
}

/** Enforced per-plan limits (must match the marketing copy above). */
export interface PlanLimits {
  requestsPerDay: number;
  requestsPerMonth: number;
  collections: number;
  /** Stateful tools (persistent memory writes, seals) require a paid plan. */
  stateful: boolean;
  /** KEEPER GOTCHI (08-wisp-chat.md §8.2): hosted companion chat turns a day
   *  through POST /api/companion/chat with a Wisp key. 0 = chat is not in the
   *  plan (free, and a lapsed paid plan, which falls to free). A separate
   *  counter from requestsPerDay: the MCP tools make no model call, chat does. */
  chatPerDay: number;
  /** The burst ceiling on the same counter's minute window. Hosted chat lands
   *  on grimtwo's ONE local rail, shared with GVR's own companion and analyst
   *  chat (4 llama.cpp slots, about 6 s a turn measured in slice 07, so about
   *  40 turns a minute for everyone). A day cap alone lets one key spend its
   *  whole day in an hour; this bounds what one key can take of the box in
   *  any minute. */
  chatPerMinute: number;
}

export const PLAN_LIMITS: Record<WispPlan, PlanLimits> = {
  // Free is day-bound (~1k/day); paid tiers are month-bound (day cap == month cap).
  free: { requestsPerDay: 1000, requestsPerMonth: 31000, collections: 1, stateful: false, chatPerDay: 0, chatPerMinute: 0 },
  // Holder is metered by gotchis + desk calls on GVR's side; the MCP itself stays modest.
  holder: { requestsPerDay: 2000, requestsPerMonth: 60000, collections: 1, stateful: true, chatPerDay: 200, chatPerMinute: 6 },
  pro: { requestsPerDay: 25000, requestsPerMonth: 25000, collections: 3, stateful: true, chatPerDay: 2000, chatPerMinute: 12 },
  studio: { requestsPerDay: 250000, requestsPerMonth: 250000, collections: 9999, stateful: true, chatPerDay: 20000, chatPerMinute: 20 },
};

/** PARTNER KEYS: app developers the owner picks use Wisp free; their players
 *  pay. A partner key never lapses and is never billed. Its chat is metered
 *  per player: a player who granted the app gets a small free allowance, and
 *  the bigger one when their own wallet holds a paid Wisp plan (Holder or
 *  above). Players who have not granted the app share the key's guest pool.
 *  Set playerFreePerDay to 0 to make chat for paying players only. */
export const PARTNER_LIMITS = {
  requestsPerDay: 25000,
  requestsPerMonth: 250000,
  /** All chat through one partner key in a UTC day, and in any minute. */
  chatPerDay: 5000,
  chatPerMinute: 20,
  /** Per player wallet per UTC day, across every partner app. */
  playerFreePerDay: 20,
  playerPaidPerDay: 200,
  /** Turns from players who have not granted the key, per key per UTC day. */
  guestPerDay: 200,
} as const;

/** Does the plan in force include hosted chat? The grant (§8.2). */
export function chatGranted(plan: WispPlan): boolean {
  return PLAN_LIMITS[plan].chatPerDay > 0;
}
