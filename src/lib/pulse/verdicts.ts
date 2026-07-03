/**
 * Health-verdict rules for Pulse. Verdicts are computed from transparent
 * thresholds (ruleText is shown verbatim in the page's Methodology section);
 * levers are hand-written editorial, always rendered with an
 * "opinion — aspirational" badge. Edit thresholds/levers here only.
 */
import { computeDelta, type PulsePoint } from "./aggregate";

export type VerdictColor = "green" | "yellow" | "red" | "accruing";
export type SeriesMap = Record<string, PulsePoint[]>;
export type PulseVerdict = {
  key: string;
  label: string;
  verdict: VerdictColor;
  delta: number | null;
  ruleText: string;
  lever: string;
};

type VerdictDef = {
  key: string;
  label: string;
  metric: string;
  mode: "flow" | "level";
  days: number;
  /** delta% >= green → green; >= yellow → yellow; else red */
  green: number;
  yellow: number;
  ruleText: string;
  lever: string;
};

export const VERDICT_DEFS: VerdictDef[] = [
  {
    key: "sales-volume",
    label: "Marketplace volume",
    metric: "sales_volume_ghst",
    mode: "flow",
    days: 30,
    green: -5,
    yellow: -20,
    ruleText: "Settled GHST volume, last 30 days vs the prior 30. Green ≥ −5%, yellow ≥ −20%, red below.",
    lever: "Volume follows reasons to trade: wearable and forge releases, rarity-farming seasons, events that reshuffle builds. Release cadence is the honest lever.",
  },
  {
    key: "buyers",
    label: "Unique buyers",
    metric: "sales_buyers",
    mode: "flow",
    days: 30,
    green: -5,
    yellow: -20,
    ruleText: "Sum of daily unique buyer addresses, last 30 days vs the prior 30. Green ≥ −5%, yellow ≥ −20%, red below.",
    lever: "New buyers need an on-ramp: cheap starter gotchis, visible quests, and a reason to own one. Onboarding funnels would move this more than anything.",
  },
  {
    key: "ghst-price",
    label: "GHST price",
    metric: "ghst_price_usd",
    mode: "level",
    days: 90,
    green: 5,
    yellow: -15,
    ruleText: "GHST/USD today vs 90 days ago. Green ≥ +5%, yellow ≥ −15%, red below.",
    lever: "Price follows demand for what GHST buys. Real sinks — arena seasons, forge fees, cosmetics — plus visible shipping are the levers that don't lie.",
  },
  {
    key: "holders",
    label: "GHST holders on Base",
    metric: "ghst_holders",
    mode: "level",
    days: 30,
    green: 0.0001,
    yellow: -2,
    ruleText: "Holder count today vs 30 days ago. Green > 0%, yellow ≥ −2%, red below. Accruing until 30 days of snapshots exist.",
    lever: "Holder growth tracks new-user inflow. Quests and events that pay out in GHST on Base widen the base; nothing else does it durably.",
  },
];

export function evaluateVerdicts(series: SeriesMap, endDay: string): PulseVerdict[] {
  return VERDICT_DEFS.map((d) => {
    const s = series[d.metric] ?? [];
    const delta = computeDelta(s, d.mode, d.days, endDay);
    const verdict: VerdictColor =
      delta == null ? "accruing" : delta >= d.green ? "green" : delta >= d.yellow ? "yellow" : "red";
    return { key: d.key, label: d.label, verdict, delta, ruleText: d.ruleText, lever: d.lever };
  });
}
