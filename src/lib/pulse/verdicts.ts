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
    lever: "Price follows demand for what GHST buys. Real sinks (arena seasons, forge fees, cosmetics) plus visible shipping are the levers that don't lie.",
  },
  {
    key: "summons",
    label: "Gotchis summoned",
    metric: "gotchis_summoned",
    mode: "flow",
    days: 30,
    green: -10,
    yellow: -40,
    ruleText: "Portals claimed on Base, last 30 days vs the prior 30. Green ≥ −10%, yellow ≥ −40%, red below. Summons are lumpy, thresholds are wider than sales.",
    lever: "Summons follow supply and a reason to summon: haunt drops, portal sales, and gameplay that makes a fresh gotchi worth raising from day one.",
  },
  {
    key: "petting",
    label: "Petting (7d actives)",
    metric: "gotchis_petted_7d",
    mode: "level",
    days: 30,
    green: -2,
    yellow: -10,
    ruleText: "Gotchis petted within the last 7 days, today vs 30 days ago. Green ≥ −2%, yellow ≥ −10%, red below. (Petting lands in large batches, so the 7d window is the stable gauge; the 24h tile shows batch cadence.) Accruing until 30 days of snapshots exist.",
    lever: "Petting is the ecosystem's heartbeat, the one act with no financial payoff except kinship. Streak rewards and kinship-gated perks are the honest lever.",
  },
  {
    key: "lending",
    label: "Gotchi lending",
    metric: "lendings_agreed",
    mode: "flow",
    days: 30,
    green: -5,
    yellow: -25,
    ruleText: "Lending agreements started, last 30 days vs the prior 30. Green ≥ −5%, yellow ≥ −25%, red below.",
    lever: "Lending runs on borrower yield: gameplay that pays scholars, one-click borrowing, and channeling worth the trip. Idle gotchis are dead inventory.",
  },
  {
    key: "channeling",
    label: "Alchemica channeling",
    metric: "gotchis_channeled_7d",
    mode: "level",
    days: 30,
    green: -2,
    yellow: -15,
    ruleText: "Gotchis that channeled within the last 7 days, today vs 30 days ago. Green ≥ −2%, yellow ≥ −15%, red below. Accruing until 30 days of snapshots exist.",
    lever: "Channeling only matters if alchemica buys something. Crafting sinks and recipes that consume FUD/FOMO/ALPHA/KEK are the lever. Emission without sinks is noise.",
  },
  {
    key: "dao-turnout",
    label: "DAO turnout",
    metric: "dao_turnout_vp",
    mode: "flow",
    days: 90,
    green: -10,
    yellow: -35,
    ruleText: "Voting power cast on proposals closing in the last 90 days vs the prior 90. Green ≥ −10%, yellow ≥ −35%, red below. Proposals are sparse, 90d windows smooth the lumps.",
    lever: "Turnout follows convenience and stakes: delegation, voting from the tools holders already use, and proposals that visibly move the treasury. 7.2M quorum only works if voting is cheap.",
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
