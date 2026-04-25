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
  alchemicaPrices?: AlchemicaPrices;
};

export type AutoPriceResult = {
  brs: number;
  band: string;
  goal: AutoPriceGoal;
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
  const notes: string[] = [];

  // Channelling premium signal for this band
  const chComp = buildChannellingComparison(lendings).find((r) => r.brsBand === band);
  let channellingAllowed = true;
  if (chComp && chComp.premiumPct != null) {
    if (chComp.premiumPct < -10) {
      channellingAllowed = false;
      notes.push(
        `Channelling-off carries a ~${Math.round(Math.abs(chComp.premiumPct))}% price premium in this band — turning off channelling.`
      );
    } else if (chComp.premiumPct > 10) {
      notes.push(
        `Channelling-on adds ~${Math.round(chComp.premiumPct)}% — leaving it on.`
      );
    }
  }

  // Heatmap-driven candidate eval
  const haunt = input.hauntId ?? 2;
  const alchPrices = input.alchemicaPrices ?? ALCHEMICA_PRICES_GHST_FALLBACK;
  // Default lender split = 20% (typical 80/20). Lender gets that share of channelling.
  const lenderSplit = 0.20;

  const candidates: AutoPriceCandidate[] = [];
  for (const periodDays of periodOptions) {
    const periodSec = periodDays * 86400;
    let prices = compsForCell(lendings, brs, periodSec);
    let compsCount = prices.length;
    const reasons: string[] = [];

    if (prices.length < 3) {
      const wide = compsBandWide(lendings, brs);
      if (wide.length >= 3) {
        prices = wide;
        compsCount = wide.length;
        reasons.push("used same-band comps across all durations");
      } else {
        reasons.push("very thin comp data — directional only");
      }
    }

    const upfront = priceForGoal(prices, goal);
    const fillProb = fillProbabilityFromCompCount(compsCount, periodDays);
    const expectedRevenue = upfront * fillProb;
    // Normalize to GHST/week to compare across periods
    const ghstPerWeek = (upfront * 7) / Math.max(1, periodDays);

    // Channelling value: borrower could channel up to maxChannelsInPeriod times.
    // Assume realistic capture of 70% of max (some borrowers don't channel daily).
    const maxChannels = maxChannelsInPeriod(periodSec);
    const realisticChannels = channellingAllowed ? maxChannels * 0.7 : 0;
    const totalChannellingGhst = estimateChannellingValueGhst(
      haunt,
      realisticChannels,
      alchPrices
    );
    const channellingValueLenderGhst = totalChannellingGhst * lenderSplit * fillProb;
    const totalGhstPerWeek = ghstPerWeek + (channellingValueLenderGhst * 7) / Math.max(1, periodDays);

    // Score: blend total expected revenue per week with fill probability
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
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Confidence: scale by best candidate's compsCount, capped
  const confidence = Math.min(100, Math.round((best?.compsCount ?? 0) * 12));
  if (confidence < 30) {
    notes.push("Low comp density in this band; treat the recommendation as a starting point.");
  }

  // Default split — use the protocol-typical 80% borrower / 20% lender, account for fee config
  const splitBorrower = 80;
  const splitOwner = 20;
  const splitOther = 0;

  return {
    brs,
    band,
    goal,
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
  brsByToken: { tokenId: string; brs: number }[],
  goal: AutoPriceGoal = "balance"
): Map<string, AutoPriceResult> {
  const out = new Map<string, AutoPriceResult>();
  for (const g of brsByToken) {
    out.set(g.tokenId, autoPrice(lendings, { brs: g.brs }, goal));
  }
  return out;
}

// Simple sanity export
export { filterByAddress, BRS_BANDS };
