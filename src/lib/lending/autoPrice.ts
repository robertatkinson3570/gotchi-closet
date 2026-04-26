import type { HistoricalLending } from "@/hooks/useHistoricalLendings";
import {
  buildChannellingComparison,
  quantile,
  filterByAddress,
} from "./analytics";
import { brsBandOf, durationBucketOf, BRS_BANDS } from "./types";
import {
  estimateChannellingValueGhst,
  maxChannelsInPeriod,
  ALCHEMICA_PRICES_GHST_FALLBACK,
  type AlchemicaPrices,
} from "./alchemica";

export type AutoPriceGoal =
  | "maximize_revenue" // chase the high price; might sit unrented
  | "balance" // realistic price, expected to fill
  | "fast_fill"; // discount to ensure rent fast

export type AutoPriceInput = {
  brs: number;
  // candidate periods in days the optimizer can search over
  periodDaysOptions?: number[];
  // for channelling yield projection
  hauntId?: number;
  kinship?: number;
  alchemicaPrices?: AlchemicaPrices;
};

export type AutoPriceMode = "battler" | "channelling";

export type AutoPriceResult = {
  brs: number;
  band: string;
  goal: AutoPriceGoal;
  // Which market the recommendation targets
  mode: AutoPriceMode;
  // Best candidate
  recommendedPeriodDays: number;
  recommendedUpfrontGhst: number;
  recommendedSplitBorrower: number;
  recommendedSplitOwner: number;
  recommendedSplitOther: number;
  recommendedChannellingAllowed: boolean;
  // confidence score 0-100, based on how thick the comp set is
  confidence: number;
  // expected GHST/week assuming the listing fills (upfront × 7 / period)
  expectedGhstPerWeek: number;
  // each candidate evaluated, sorted desc by score
  candidates: AutoPriceCandidate[];
  notes: string[];
};

export type AutoPriceCandidate = {
  periodDays: number;
  upfrontGhst: number;
  fillProbability: number; // 0-1
  expectedRevenue: number; // upfront * fillProbability
  ghstPerWeek: number;
  // expected channelling alchemica value to lender if channelling is on (GHST-equivalent)
  channellingValueLenderGhst: number;
  // total expected revenue per week incl. channelling alchemica
  totalGhstPerWeek: number;
  compsCount: number;
  score: number;
  reasons: string[];
};

const DEFAULT_PERIODS = [1, 2, 3, 7, 14, 30];

// Given a period and BRS, fetch sorted prices from comps in that BRS band + duration bucket
function compsForCell(
  lendings: HistoricalLending[],
  brs: number,
  periodSec: number
): number[] {
  const band = brsBandOf(brs);
  const bucket = durationBucketOf(periodSec);
  const open = lendings.filter(
    (l) =>
      (!l.whitelistId || l.whitelistId === "0") &&
      l.upfrontGhst > 0 &&
      brsBandOf(l.gotchiBRS) === band &&
      durationBucketOf(l.period) === bucket
  );
  return open.map((l) => l.upfrontGhst).sort((a, b) => a - b);
}

// Cross-period fallback: same band, all durations
function compsBandWide(
  lendings: HistoricalLending[],
  brs: number
): number[] {
  const band = brsBandOf(brs);
  const open = lendings.filter(
    (l) =>
      (!l.whitelistId || l.whitelistId === "0") &&
      l.upfrontGhst > 0 &&
      brsBandOf(l.gotchiBRS) === band
  );
  return open.map((l) => l.upfrontGhst).sort((a, b) => a - b);
}

// Channelling-mode comps: any open-market paid lending with channelling=true,
// regardless of BRS or duration bucket. The renter is paying for parcel-yield
// access, not battler stats.
function compsChannelling(
  lendings: HistoricalLending[],
  periodSec: number
): number[] {
  const bucket = durationBucketOf(periodSec);
  const open = lendings.filter(
    (l) =>
      (!l.whitelistId || l.whitelistId === "0") &&
      l.upfrontGhst > 0 &&
      l.channellingAllowed
  );
  // Prefer same-bucket comps; fall back to all if too few
  const sameBucket = open.filter((l) => durationBucketOf(l.period) === bucket);
  return (sameBucket.length >= 3 ? sameBucket : open)
    .map((l) => l.upfrontGhst)
    .sort((a, b) => a - b);
}

// Estimate fill probability from comp count (assumes 30d window)
function fillProbabilityFromCompCount(count: number, periodDays: number): number {
  // demand per week = comps / (windowDays / 7); we list for periodDays so we get
  // (periodDays/7) chances. Cap at 0.95.
  const windowDays = 30; // matches the analytics 30d default; actual depends on caller window
  const weeksOfWindow = windowDays / 7;
  const demandPerWeek = count / weeksOfWindow;
  const opportunities = Math.max(0.5, periodDays / 7);
  const p = 1 - Math.pow(Math.max(0.001, 1 - demandPerWeek / 5), opportunities);
  return Math.min(0.95, Math.max(0.02, p));
}

function priceForGoal(prices: number[], goal: AutoPriceGoal): number {
  if (!prices.length) return 0;
  switch (goal) {
    case "maximize_revenue":
      return quantile(prices, 0.85);
    case "fast_fill":
      return quantile(prices, 0.35);
    case "balance":
    default:
      return quantile(prices, 0.55);
  }
}

export function autoPrice(
  lendings: HistoricalLending[],
  input: AutoPriceInput,
  goal: AutoPriceGoal = "balance"
): AutoPriceResult {
  const { brs } = input;
  const periodOptions = input.periodDaysOptions ?? DEFAULT_PERIODS;
  const band = brsBandOf(brs);
  const haunt = input.hauntId ?? 2;
  const kinship = input.kinship ?? 50;
  const alchPrices = input.alchemicaPrices ?? ALCHEMICA_PRICES_GHST_FALLBACK;
  const notes: string[] = [];

  // Battler-side channelling premium signal
  const chComp = buildChannellingComparison(lendings).find((r) => r.brsBand === band);
  let battlerChannellingAllowed = true;
  if (chComp && chComp.premiumPct != null && chComp.premiumPct < -10) {
    battlerChannellingAllowed = false;
  }

  const candidates: AutoPriceCandidate[] = [];
  const candidateModes: AutoPriceMode[] = [];

  for (const periodDays of periodOptions) {
    const periodSec = periodDays * 86400;
    let prices: number[] = [];
    let mode: AutoPriceMode = "battler";
    let goalForCandidate: AutoPriceGoal = goal;
    const reasons: string[] = [];

    // Tier 1 — battler band+bucket
    prices = compsForCell(lendings, brs, periodSec);

    // Tier 2 — battler band-wide (any duration)
    if (prices.length < 3) {
      const wide = compsBandWide(lendings, brs);
      if (wide.length >= 3) {
        prices = wide;
        reasons.push("battler comps thin in cell — used same-band any-duration");
      } else {
        // Tier 3 — channelling mode (no BRS filter; channelling-allowed only)
        const ch = compsChannelling(lendings, periodSec);
        if (ch.length >= 3) {
          prices = ch;
          mode = "channelling";
          // Channelling renters are price-sensitive; pick a lower percentile
          goalForCandidate = goal === "maximize_revenue" ? "balance" : "fast_fill";
          reasons.push("no battler comps → channelling-mode (any-BRS, channel=on)");
        } else {
          reasons.push("very thin comp data — using alch-yield floor only");
        }
      }
    }

    let upfront = priceForGoal(prices, goalForCandidate);

    // Channelling rentals: floor at ~25% of expected alch yield to lender so it always fills
    const candidateChannelling = mode === "channelling" ? true : battlerChannellingAllowed;
    const realisticChannels = candidateChannelling
      ? maxChannelsInPeriod(periodSec) * 0.7
      : 0;
    const totalAlchYield = estimateChannellingValueGhst(
      haunt,
      realisticChannels,
      alchPrices,
      kinship
    );
    if (mode === "channelling" && upfront < totalAlchYield * 0.25) {
      upfront = totalAlchYield * 0.25;
      reasons.push(
        `floored at 25% of expected ${totalAlchYield.toFixed(1)} GHST alch yield (kinship ${kinship})`
      );
    }
    if (prices.length === 0 && totalAlchYield > 0) {
      // No comps at all: anchor on alch yield × 25%
      upfront = totalAlchYield * 0.25;
      mode = "channelling";
    }

    const compsCount = prices.length;
    const fillProb = fillProbabilityFromCompCount(compsCount, periodDays);
    const expectedRevenue = upfront * fillProb;
    const ghstPerWeek = (upfront * 7) / Math.max(1, periodDays);

    // Lender split varies by mode — channelling renters expect lender to take more
    const lenderSplit = mode === "channelling" ? 0.50 : 0.20;
    const channellingValueLenderGhst = totalAlchYield * lenderSplit * fillProb;
    const totalGhstPerWeek =
      ghstPerWeek + (channellingValueLenderGhst * 7) / Math.max(1, periodDays);

    const score =
      (expectedRevenue + channellingValueLenderGhst) *
      (1 / Math.max(1, periodDays / 7)) *
      (0.5 + 0.5 * fillProb);

    candidates.push({
      periodDays,
      upfrontGhst: upfront,
      fillProbability: fillProb,
      expectedRevenue,
      ghstPerWeek,
      channellingValueLenderGhst,
      totalGhstPerWeek,
      compsCount,
      score,
      reasons,
    });
    candidateModes.push(mode);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const bestIdx = best
    ? candidates.findIndex((c) => c === best)
    : -1;
  // bestIdx points to sorted index; we need original to look up mode
  // Easier: re-derive mode from reasons
  const bestIsChannelling = best?.reasons.some((r) =>
    r.includes("channelling-mode") || r.includes("alch-yield") || r.includes("alch yield")
  ) ?? false;
  const finalMode: AutoPriceMode = bestIsChannelling ? "channelling" : "battler";
  void bestIdx;
  void candidateModes;

  if (finalMode === "channelling") {
    notes.push(
      `No battler-rental comps for this BRS — recommending channelling-renter pricing. Higher lender split (50%) captures more of the alchemica yield.`
    );
    if (kinship < 50) {
      notes.push(`Kinship ${kinship} is below baseline — alchemica yield is reduced. Consider petting before listing.`);
    } else if (kinship >= 100) {
      notes.push(`Kinship ${kinship} boosts channelling yield by ~${Math.round((1 + (kinship - 50) * 0.005 - 1) * 100)}%.`);
    }
  } else if (chComp && chComp.premiumPct != null && chComp.premiumPct > 10) {
    notes.push(`Channelling-on adds ~${Math.round(chComp.premiumPct)}% in this band — leaving it on.`);
  } else if (!battlerChannellingAllowed) {
    notes.push(
      `Channelling-off carries a price premium in this band — turning off channelling for max revenue.`
    );
  }

  const confidence = Math.min(100, Math.round((best?.compsCount ?? 0) * 12));
  if (confidence < 30 && finalMode === "battler") {
    notes.push("Low comp density; treat the recommendation as a starting point.");
  }

  // Splits + channelling depend on mode
  const splitBorrower = finalMode === "channelling" ? 50 : 80;
  const splitOwner = finalMode === "channelling" ? 50 : 20;
  const splitOther = 0;
  const channellingAllowed = finalMode === "channelling" ? true : battlerChannellingAllowed;

  return {
    brs,
    band,
    goal,
    mode: finalMode,
    recommendedPeriodDays: best?.periodDays ?? 7,
    recommendedUpfrontGhst: best?.upfrontGhst ?? 0,
    recommendedSplitBorrower: splitBorrower,
    recommendedSplitOwner: splitOwner,
    recommendedSplitOther: splitOther,
    recommendedChannellingAllowed: channellingAllowed,
    confidence,
    expectedGhstPerWeek: best?.ghstPerWeek ?? 0,
    candidates,
    notes,
  };
}

// Optimize across many gotchis at once — used by bulk-list wizard.
export function autoPriceBatch(
  lendings: HistoricalLending[],
  inputs: { tokenId: string; brs: number; hauntId?: number; kinship?: number }[],
  goal: AutoPriceGoal = "balance",
  alchemicaPrices?: AlchemicaPrices
): Map<string, AutoPriceResult> {
  const out = new Map<string, AutoPriceResult>();
  for (const g of inputs) {
    out.set(
      g.tokenId,
      autoPrice(
        lendings,
        {
          brs: g.brs,
          hauntId: g.hauntId,
          kinship: g.kinship,
          alchemicaPrices,
        },
        goal
      )
    );
  }
  return out;
}

// Simple sanity export
export { filterByAddress, BRS_BANDS };
