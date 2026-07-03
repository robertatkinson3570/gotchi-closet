# Pulse — State of the Aavegotchiverse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pulse` — a public State-of-the-Aavegotchiverse page: backfilled daily GHST + sales history with health verdicts and hand-written "lever" commentary, served from one precomputed API payload.

**Architecture:** Pure aggregation/verdict/payload logic lives in `src/lib/pulse/` (frontend-importable, fully unit-tested — same split as `src/lib/quorumVp.ts` vs `server/dao/quorum.ts`). Server I/O lives in `server/pulse/`: SQLite store (`data/pulse.db`), verified network fetchers, a backfill-once + nightly-cron service, and a 202-while-building route mounted at `/api/pulse`. The page is a pure render of the payload with recharts.

**Tech Stack:** TypeScript, Express 5, better-sqlite3, node-cron, viem, vitest, React 18, react-query, recharts.

**Spec:** `docs/superpowers/specs/2026-07-02-pulse-state-of-union-design.md`

**Verified facts (probed live 2026-07-02 — do not re-derive):**
- Core subgraph `erc721Listings` has `priceInWei category timePurchased buyer seller` (buyer/seller plain lowercase address strings; category is a **string**).
- Core subgraph `erc1155Purchases` has `priceInWei quantity category timeLastPurchased buyer seller`. **Volume = priceInWei × quantity.**
- GBM subgraph `auctions` has `highestBid highestBidder seller category endsAt type` (category is an **int**, type is `"erc721" | "erc1155"`).
- DefiLlama daily history works: `https://coins.llama.fi/chart/base:0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB?start=<ts>&span=<days>&period=1d` → `coins["base:0x…"].prices[{timestamp, price}]`.
- Blockscout holder count: `https://base.blockscout.com/api/v2/tokens/0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB/counters` → `{"token_holders_count":"78798", …}`.

**Commands:** tests `pnpm vitest run <file>`, typecheck `pnpm typecheck`, dev `pnpm dev` (vite :5000 + tsx server).

---

## Metric keys (canonical)

Stored in SQLite: `ghst_price_usd`, `ghst_supply`, `ghst_holders`, `gotchi_floor_ghst` (level metrics); `sales_volume_ghst`, `sales_count`, `sales_buyers`, `sales_sellers`, `sales_ghst_gotchis`, `sales_ghst_parcels`, `sales_ghst_wearables`, `sales_ghst_other` (flow metrics).
Derived at payload build (never stored): `sales_volume_usd` (per-day volume × that-day price), `sales_avg_ghst`, `ghst_mcap_usd` (price × latest supply, approximate).

---

### Task 1: Pure aggregation lib

**Files:**
- Create: `src/lib/pulse/aggregate.ts`
- Test: `src/lib/pulse/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pulse/aggregate.test.ts
import { describe, expect, it } from "vitest";
import {
  addDays, bucketSales, computeDelta, dayKey, dayStartTs, levelAt, pctChange, sumRange,
  type PulsePoint, type SaleRow,
} from "./aggregate";

const ts = (y: number, mo: number, d: number, h = 12) => Math.floor(Date.UTC(y, mo - 1, d, h) / 1000);

describe("dayKey / addDays / dayStartTs", () => {
  it("buckets by UTC day and handles boundaries", () => {
    expect(dayKey(Math.floor(Date.UTC(2026, 0, 15, 23, 59, 59) / 1000))).toBe("2026-01-15");
    expect(dayKey(Math.floor(Date.UTC(2026, 0, 16, 0, 0, 0) / 1000))).toBe("2026-01-16");
  });
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("dayStartTs is midnight UTC", () => {
    expect(dayStartTs("2026-01-16")).toBe(Math.floor(Date.UTC(2026, 0, 16) / 1000));
  });
});

describe("bucketSales", () => {
  const rows: SaleRow[] = [
    { t: ts(2026, 6, 1), ghst: 100, cat: "gotchis", buyer: "0xA", seller: "0xB" },
    { t: ts(2026, 6, 1), ghst: 50, cat: "wearables", buyer: "0xa", seller: "0xC" }, // same buyer, different case
    { t: ts(2026, 6, 2), ghst: 10, cat: "other", buyer: "0xD", seller: "0xE" },
    { t: ts(2026, 6, 1), ghst: 0, cat: "gotchis", buyer: "0xF", seller: "0xG" }, // zero-price → skipped
  ];
  const out = bucketSales(rows);
  const get = (day: string, metric: string) => out.find((r) => r.day === day && r.metric === metric)?.value;

  it("sums volume and counts per UTC day", () => {
    expect(get("2026-06-01", "sales_volume_ghst")).toBe(150);
    expect(get("2026-06-01", "sales_count")).toBe(2);
    expect(get("2026-06-02", "sales_volume_ghst")).toBe(10);
  });
  it("dedupes buyers case-insensitively", () => {
    expect(get("2026-06-01", "sales_buyers")).toBe(1);
    expect(get("2026-06-01", "sales_sellers")).toBe(2);
  });
  it("splits volume by category", () => {
    expect(get("2026-06-01", "sales_ghst_gotchis")).toBe(100);
    expect(get("2026-06-01", "sales_ghst_wearables")).toBe(50);
    expect(get("2026-06-01", "sales_ghst_parcels")).toBe(0);
  });
  it("emits days in ascending order", () => {
    expect(out[0].day <= out[out.length - 1].day).toBe(true);
  });
});

describe("pctChange / sumRange / levelAt", () => {
  it("pctChange handles zero prior", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(5, 0)).toBeNull();
  });
  const s: PulsePoint[] = [
    { day: "2026-06-01", value: 10 },
    { day: "2026-06-03", value: 20 },
    { day: "2026-06-05", value: 30 },
  ];
  it("sumRange is from-inclusive, to-exclusive", () => {
    expect(sumRange(s, "2026-06-01", "2026-06-05")).toBe(30);
    expect(sumRange(s, "2026-06-01", "2026-06-06")).toBe(60);
  });
  it("levelAt returns last value at-or-before the day (gap-tolerant)", () => {
    expect(levelAt(s, "2026-06-04")).toBe(20);
    expect(levelAt(s, "2026-05-31")).toBeNull();
  });
});

describe("computeDelta", () => {
  // 20 days of flow data: first 10 days value 10/day, last 10 days value 20/day
  const flow: PulsePoint[] = [];
  for (let i = 0; i < 20; i++) flow.push({ day: addDays("2026-06-01", i), value: i < 10 ? 10 : 20 });
  it("flow mode compares trailing windows", () => {
    // endDay 2026-06-21: last 10 days sum 200, prior 10 days sum 100 → +100%
    expect(computeDelta(flow, "flow", 10, "2026-06-21")).toBeCloseTo(100);
  });
  it("returns null when history is insufficient", () => {
    expect(computeDelta(flow, "flow", 30, "2026-06-21")).toBeNull();
    expect(computeDelta([], "flow", 7, "2026-06-21")).toBeNull();
  });
  it("level mode compares point values", () => {
    const level: PulsePoint[] = [
      { day: "2026-05-01", value: 100 },
      { day: "2026-06-01", value: 90 },
    ];
    expect(computeDelta(level, "level", 30, "2026-06-01")).toBeCloseTo(-10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/pulse/aggregate.test.ts`
Expected: FAIL — cannot resolve `./aggregate`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pulse/aggregate.ts
/**
 * Pure day-bucketing + trend math for the Pulse (state-of-the-Aavegotchiverse)
 * pipeline. No I/O — the server half (server/pulse/) feeds and stores this.
 */

export type PulsePoint = { day: string; value: number };
export type MetricRow = { day: string; metric: string; value: number };
export type SaleCat = "gotchis" | "parcels" | "wearables" | "other";
export type SaleRow = { t: number; ghst: number; cat: SaleCat; buyer: string; seller: string };

/** UTC calendar day of a unix-seconds timestamp, as YYYY-MM-DD. */
export function dayKey(tSeconds: number): string {
  return new Date(tSeconds * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Unix seconds at 00:00:00 UTC of the given day. */
export function dayStartTs(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

/** Folds raw sales into per-UTC-day metric rows (see canonical metric keys). */
export function bucketSales(rows: SaleRow[]): MetricRow[] {
  type Agg = {
    volume: number; count: number;
    buyers: Set<string>; sellers: Set<string>;
    byCat: Record<SaleCat, number>;
  };
  const days = new Map<string, Agg>();
  for (const r of rows) {
    if (!(r.ghst > 0)) continue;
    const day = dayKey(r.t);
    let a = days.get(day);
    if (!a) {
      a = { volume: 0, count: 0, buyers: new Set(), sellers: new Set(), byCat: { gotchis: 0, parcels: 0, wearables: 0, other: 0 } };
      days.set(day, a);
    }
    a.volume += r.ghst;
    a.count += 1;
    if (r.buyer) a.buyers.add(r.buyer.toLowerCase());
    if (r.seller) a.sellers.add(r.seller.toLowerCase());
    a.byCat[r.cat] += r.ghst;
  }
  const out: MetricRow[] = [];
  for (const [day, a] of [...days.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    out.push({ day, metric: "sales_volume_ghst", value: a.volume });
    out.push({ day, metric: "sales_count", value: a.count });
    out.push({ day, metric: "sales_buyers", value: a.buyers.size });
    out.push({ day, metric: "sales_sellers", value: a.sellers.size });
    out.push({ day, metric: "sales_ghst_gotchis", value: a.byCat.gotchis });
    out.push({ day, metric: "sales_ghst_parcels", value: a.byCat.parcels });
    out.push({ day, metric: "sales_ghst_wearables", value: a.byCat.wearables });
    out.push({ day, metric: "sales_ghst_other", value: a.byCat.other });
  }
  return out;
}

export function pctChange(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

/** Sum of points with fromDay <= day < toDayExcl. Series must be day-keyed. */
export function sumRange(series: PulsePoint[], fromDay: string, toDayExcl: string): number {
  let s = 0;
  for (const p of series) if (p.day >= fromDay && p.day < toDayExcl) s += p.value;
  return s;
}

/** Last value at or before `day` (gap-tolerant); null if series starts later. */
export function levelAt(series: PulsePoint[], day: string): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (p.day <= day) v = p.value;
    else break;
  }
  return v;
}

/**
 * Percent change over a trailing window ending at endDay (exclusive — a
 * partial "today" never pollutes the math).
 *  - flow: sum of last `days` vs the prior `days`
 *  - level: value at endDay vs value `days` earlier
 * Returns null when the series doesn't reach back far enough.
 */
export function computeDelta(
  series: PulsePoint[],
  mode: "flow" | "level",
  days: number,
  endDay: string
): number | null {
  if (series.length === 0) return null;
  const first = series[0].day;
  if (mode === "flow") {
    const midDay = addDays(endDay, -days);
    const startDay = addDays(endDay, -2 * days);
    if (first > startDay) return null;
    return pctChange(sumRange(series, midDay, endDay), sumRange(series, startDay, midDay));
  }
  const prevDay = addDays(endDay, -days);
  if (first > prevDay) return null;
  const cur = levelAt(series, endDay);
  const prev = levelAt(series, prevDay);
  if (cur == null || prev == null) return null;
  return pctChange(cur, prev);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/pulse/aggregate.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/aggregate.ts src/lib/pulse/aggregate.test.ts
git commit -m "feat(pulse): pure day-bucketing and trend math"
```

---

### Task 2: Verdict rules

**Files:**
- Create: `src/lib/pulse/verdicts.ts`
- Test: `src/lib/pulse/verdicts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pulse/verdicts.test.ts
import { describe, expect, it } from "vitest";
import { addDays, type PulsePoint } from "./aggregate";
import { VERDICT_DEFS, evaluateVerdicts } from "./verdicts";

/** n days of flow data ending the day before endDay, split half old-rate, half new-rate. */
function flowSeries(endDay: string, n: number, oldRate: number, newRate: number): PulsePoint[] {
  const out: PulsePoint[] = [];
  for (let i = n; i >= 1; i--) {
    out.push({ day: addDays(endDay, -i), value: i > n / 2 ? oldRate : newRate });
  }
  return out;
}

const END = "2026-07-02";

describe("evaluateVerdicts", () => {
  it("returns one result per definition, accruing on empty data", () => {
    const res = evaluateVerdicts({}, END);
    expect(res.length).toBe(VERDICT_DEFS.length);
    for (const r of res) expect(r.verdict).toBe("accruing");
  });

  it("flags steady volume green and collapsed volume red", () => {
    const steady = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 100) }, END);
    expect(steady.find((r) => r.key === "sales-volume")?.verdict).toBe("green");
    const collapsed = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 50) }, END);
    expect(collapsed.find((r) => r.key === "sales-volume")?.verdict).toBe("red");
  });

  it("grades a mild dip yellow", () => {
    const mild = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 90) }, END);
    expect(mild.find((r) => r.key === "sales-volume")?.verdict).toBe("yellow");
  });

  it("grades price on 90d level change", () => {
    const up: PulsePoint[] = [
      { day: addDays(END, -91), value: 0.4 },
      { day: END, value: 0.5 },
    ];
    const res = evaluateVerdicts({ ghst_price_usd: up }, END);
    expect(res.find((r) => r.key === "ghst-price")?.verdict).toBe("green");
  });

  it("every definition carries ruleText and a lever", () => {
    for (const d of VERDICT_DEFS) {
      expect(d.ruleText.length).toBeGreaterThan(10);
      expect(d.lever.length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/pulse/verdicts.test.ts`
Expected: FAIL — cannot resolve `./verdicts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pulse/verdicts.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/pulse/verdicts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/verdicts.ts src/lib/pulse/verdicts.test.ts
git commit -m "feat(pulse): threshold verdict rules with hand-written levers"
```

---

### Task 3: Payload builder

**Files:**
- Create: `src/lib/pulse/payload.ts`
- Test: `src/lib/pulse/payload.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pulse/payload.test.ts
import { describe, expect, it } from "vitest";
import { buildPulsePayload } from "./payload";
import type { SeriesMap } from "./verdicts";

const UPDATED_AT = Date.UTC(2026, 6, 2, 12); // endDay = 2026-07-02

const stored: SeriesMap = {
  ghst_price_usd: [
    { day: "2026-06-29", value: 0.5 },
    { day: "2026-07-01", value: 0.6 },
  ],
  sales_volume_ghst: [
    { day: "2026-06-30", value: 1000 },
    { day: "2026-07-01", value: 2000 },
  ],
  sales_count: [
    { day: "2026-06-30", value: 10 },
    { day: "2026-07-01", value: 0 },
  ],
  ghst_supply: [{ day: "2026-07-01", value: 50_000_000 }],
};

describe("buildPulsePayload", () => {
  const p = buildPulsePayload(stored, UPDATED_AT);

  it("derives per-day USD volume from that day's price", () => {
    expect(p.series.sales_volume_usd).toEqual([
      { day: "2026-06-30", value: 1000 * 0.5 }, // levelAt: 06-29 price carries forward
      { day: "2026-07-01", value: 2000 * 0.6 },
    ]);
  });

  it("derives average sale price, guarding division by zero", () => {
    expect(p.series.sales_avg_ghst).toEqual([
      { day: "2026-06-30", value: 100 },
      { day: "2026-07-01", value: 0 },
    ]);
  });

  it("derives approximate mcap from price × latest supply", () => {
    expect(p.series.ghst_mcap_usd?.[1].value).toBeCloseTo(0.6 * 50_000_000);
  });

  it("exposes latest values and trackingSince", () => {
    expect(p.latest.ghst_price_usd).toBe(0.6);
    expect(p.trackingSince.sales_volume_ghst).toBe("2026-06-30");
  });

  it("computes 30d windows over complete days", () => {
    expect(p.windows.sales_volume_ghst_30d).toBe(3000);
    expect(p.windows.sales_count_30d).toBe(10);
  });

  it("includes verdicts and updatedAt", () => {
    expect(p.verdicts.length).toBeGreaterThan(0);
    expect(p.updatedAt).toBe(UPDATED_AT);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/pulse/payload.test.ts`
Expected: FAIL — cannot resolve `./payload`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pulse/payload.ts
/**
 * Assembles the /api/pulse response from stored daily series: derived series
 * (USD volume, average sale, approx mcap), latest values, WoW/MoM deltas,
 * 30d window sums, verdicts, and tracking-since dates. Pure — tested.
 */
import { addDays, computeDelta, dayKey, levelAt, sumRange, type PulsePoint } from "./aggregate";
import { evaluateVerdicts, type PulseVerdict, type SeriesMap } from "./verdicts";

export type PulseDelta = { wow: number | null; mom: number | null };
export type PulsePayload = {
  updatedAt: number;
  series: SeriesMap;
  latest: Record<string, number>;
  deltas: Record<string, PulseDelta>;
  windows: Record<string, number>;
  verdicts: PulseVerdict[];
  trackingSince: Record<string, string>;
};

const FLOW_METRICS = new Set([
  "sales_volume_ghst", "sales_volume_usd", "sales_count", "sales_buyers", "sales_sellers",
  "sales_ghst_gotchis", "sales_ghst_parcels", "sales_ghst_wearables", "sales_ghst_other",
]);

export function buildPulsePayload(stored: SeriesMap, updatedAt: number): PulsePayload {
  const series: SeriesMap = { ...stored };
  const price = stored.ghst_price_usd ?? [];
  const vol = stored.sales_volume_ghst ?? [];

  // Derived series. Historical USD uses that day's stored price, never spot.
  series.sales_volume_usd = vol.map((p) => ({ day: p.day, value: p.value * (levelAt(price, p.day) ?? 0) }));
  const countByDay = new Map((stored.sales_count ?? []).map((p) => [p.day, p.value]));
  series.sales_avg_ghst = vol.map((p) => {
    const c = countByDay.get(p.day) ?? 0;
    return { day: p.day, value: c > 0 ? p.value / c : 0 };
  });
  const supply = lastValue(stored.ghst_supply);
  if (supply != null) {
    // Approximate: today's supply applied across history (supply snapshots only accrue forward).
    series.ghst_mcap_usd = price.map((p) => ({ day: p.day, value: p.value * supply }));
  }

  const endDay = dayKey(Math.floor(updatedAt / 1000));
  const latest: Record<string, number> = {};
  const deltas: Record<string, PulseDelta> = {};
  const trackingSince: Record<string, string> = {};
  for (const [key, s] of Object.entries(series)) {
    if (s.length === 0) continue;
    latest[key] = s[s.length - 1].value;
    trackingSince[key] = s[0].day;
    const mode = FLOW_METRICS.has(key) ? ("flow" as const) : ("level" as const);
    deltas[key] = {
      wow: computeDelta(s, mode, 7, endDay),
      mom: computeDelta(s, mode, 30, endDay),
    };
  }

  const from30 = addDays(endDay, -30);
  const windows: Record<string, number> = {
    sales_volume_ghst_30d: sumRange(series.sales_volume_ghst ?? [], from30, endDay),
    sales_volume_usd_30d: sumRange(series.sales_volume_usd ?? [], from30, endDay),
    sales_count_30d: sumRange(series.sales_count ?? [], from30, endDay),
    sales_buyers_30d: sumRange(series.sales_buyers ?? [], from30, endDay),
  };

  return { updatedAt, series, latest, deltas, windows, verdicts: evaluateVerdicts(series, endDay), trackingSince };
}

function lastValue(s: PulsePoint[] | undefined): number | null {
  return s && s.length ? s[s.length - 1].value : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/pulse/payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/payload.ts src/lib/pulse/payload.test.ts
git commit -m "feat(pulse): payload builder with derived series, deltas, windows"
```

---

### Task 4: SQLite store

**Files:**
- Create: `server/pulse/store.ts`
- Test: `server/pulse/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/pulse/store.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-test-"));
  process.env.PULSE_DB_PATH = path.join(dir, "pulse.db");
});

afterEach(async () => {
  const { closeDb } = await import("./store");
  closeDb();
  delete process.env.PULSE_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("pulse store", () => {
  it("upserts idempotently and returns day-sorted series", async () => {
    const { upsertMetrics, getAllSeries } = await import("./store");
    upsertMetrics([
      { day: "2026-07-02", metric: "sales_volume_ghst", value: 10 },
      { day: "2026-07-01", metric: "sales_volume_ghst", value: 5 },
      { day: "2026-07-01", metric: "sales_count", value: 1 },
    ]);
    // Same (day, metric) again with a corrected value → overwrites, no dup
    upsertMetrics([{ day: "2026-07-01", metric: "sales_volume_ghst", value: 7 }]);
    const all = getAllSeries();
    expect(all.sales_volume_ghst).toEqual([
      { day: "2026-07-01", value: 7 },
      { day: "2026-07-02", value: 10 },
    ]);
    expect(all.sales_count).toEqual([{ day: "2026-07-01", value: 1 }]);
  });

  it("stores and reads meta keys", async () => {
    const { getMeta, setMeta } = await import("./store");
    expect(getMeta("backfilled")).toBeNull();
    setMeta("backfilled", "1");
    setMeta("backfilled", "2");
    expect(getMeta("backfilled")).toBe("2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/pulse/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Write the implementation**

```ts
// server/pulse/store.ts
/**
 * Pulse SQLite store: one row per (UTC day, metric). Upserts are idempotent so
 * backfill and nightly refresh can safely regenerate recent days.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { MetricRow, PulsePoint } from "../../src/lib/pulse/aggregate";

let db: Database.Database | null = null;

function dbPath(): string {
  return process.env.PULSE_DB_PATH || path.resolve("./data/pulse.db");
}

/** Close and discard the current connection. Used by tests between runs. */
export function closeDb(): void {
  if (db) { db.close(); db = null; }
}

export function getDb(): Database.Database {
  if (db) return db;
  const p = dbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      day    TEXT NOT NULL,
      metric TEXT NOT NULL,
      value  REAL NOT NULL,
      PRIMARY KEY (day, metric)
    );
    CREATE INDEX IF NOT EXISTS idx_metric_day ON daily_metrics(metric, day);

    CREATE TABLE IF NOT EXISTS pulse_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function upsertMetrics(rows: MetricRow[]): void {
  if (rows.length === 0) return;
  const d = getDb();
  const stmt = d.prepare(
    `INSERT INTO daily_metrics (day, metric, value) VALUES (?, ?, ?)
     ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value`
  );
  const tx = d.transaction((rs: MetricRow[]) => {
    for (const r of rs) stmt.run(r.day, r.metric, r.value);
  });
  tx(rows);
}

export function getAllSeries(): Record<string, PulsePoint[]> {
  const rows = getDb()
    .prepare(`SELECT day, metric, value FROM daily_metrics ORDER BY day ASC`)
    .all() as { day: string; metric: string; value: number }[];
  const out: Record<string, PulsePoint[]> = {};
  for (const r of rows) (out[r.metric] ??= []).push({ day: r.day, value: r.value });
  return out;
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM pulse_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(`INSERT INTO pulse_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/pulse/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/pulse/store.ts server/pulse/store.test.ts
git commit -m "feat(pulse): sqlite daily-metrics store"
```

---

### Task 5: Network sources

**Files:**
- Create: `server/pulse/sources.ts`

No unit tests — this file is thin I/O over shapes verified live (see "Verified facts" at top). Logic (bucketing, math) already lives in tested `src/lib/pulse/`. Before writing the floor query, check `src/lib/portfolio.ts` for the active-listing where-clause it uses for cheapest gotchi and mirror it exactly.

- [ ] **Step 1: Write the implementation**

```ts
// server/pulse/sources.ts
/**
 * Pulse network fetchers. Shapes verified live 2026-07-02:
 * subgraph sale feeds (core + GBM), DefiLlama daily GHST price, Base RPC
 * supply, Blockscout holder counter, cheapest active gotchi listing.
 */
import { createPublicClient, fallback, http, erc20Abi, formatEther } from "viem";
import { base } from "viem/chains";
import { subgraphFetch } from "../aavegotchi/subgraphFetch";
import { GBM_SUBGRAPH } from "../../src/lib/subgraph";
import { dayKey, type MetricRow, type SaleCat, type SaleRow } from "../../src/lib/pulse/aggregate";

const GHST = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const RPC_URLS = ["https://mainnet.base.org", "https://base.llamarpc.com", "https://base.drpc.org"];
const PAGE = 1000;
const MAX_PAGES = 500;

const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((u) => http(u, { retryCount: 1, timeout: 15_000 }))),
});

async function gql(query: string, endpoint?: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = endpoint
        ? await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })
        : await subgraphFetch({ query }); // core subgraph with failover
      if (!res.ok) throw new Error(`subgraph ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
      return json.data;
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

function cat721(c: number): SaleCat { return c === 3 ? "gotchis" : c === 4 ? "parcels" : "other"; }
function cat1155(c: number): SaleCat { return c === 0 ? "wearables" : "other"; }

/** Timestamp-cursor walk over a settled feed until a short page. */
async function walk(fetchPage: (cursor: number) => Promise<SaleRow[]>): Promise<SaleRow[]> {
  let cursor = 0;
  const out: SaleRow[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const rows = await fetchPage(cursor);
    out.push(...rows);
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].t;
  }
  return out;
}

export async function fetchSales721(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ erc721Listings(first: ${PAGE}, where: { timePurchased_gt: "${Math.max(startTs, cursor)}", timePurchased_lt: "${endTs}" }, orderBy: timePurchased, orderDirection: asc) { priceInWei category timePurchased buyer seller } }`
    );
    return (d?.erc721Listings ?? []).map((r: any): SaleRow => ({
      t: Number(r.timePurchased),
      ghst: Number(r.priceInWei) / 1e18,
      cat: cat721(Number(r.category)),
      buyer: r.buyer ?? "",
      seller: r.seller ?? "",
    }));
  });
}

export async function fetchSales1155(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ erc1155Purchases(first: ${PAGE}, where: { timeLastPurchased_gt: "${Math.max(startTs, cursor)}", timeLastPurchased_lt: "${endTs}" }, orderBy: timeLastPurchased, orderDirection: asc) { priceInWei quantity category timeLastPurchased buyer seller } }`
    );
    return (d?.erc1155Purchases ?? []).map((r: any): SaleRow => ({
      t: Number(r.timeLastPurchased),
      ghst: (Number(r.priceInWei) / 1e18) * Number(r.quantity ?? 1),
      cat: cat1155(Number(r.category)),
      buyer: r.buyer ?? "",
      seller: r.seller ?? "",
    }));
  });
}

export async function fetchSalesGbm(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ auctions(first: ${PAGE}, where: { endsAt_gt: "${Math.max(startTs, cursor)}", endsAt_lt: "${endTs}", cancelled: false, highestBid_gt: "0" }, orderBy: endsAt, orderDirection: asc) { highestBid highestBidder seller category endsAt type } }`,
      GBM_SUBGRAPH
    );
    return (d?.auctions ?? []).map((r: any): SaleRow => ({
      t: Number(r.endsAt),
      ghst: Number(r.highestBid) / 1e18,
      cat: r.type === "erc1155" ? cat1155(Number(r.category)) : cat721(Number(r.category)),
      buyer: r.highestBidder ?? "",
      seller: r.seller ?? "",
    }));
  });
}

/** Daily GHST/USD from DefiLlama, chunked ≤500 days per request. */
export async function fetchLlamaDaily(startTs: number): Promise<MetricRow[]> {
  const out: MetricRow[] = [];
  const now = Math.floor(Date.now() / 1000);
  let chunkStart = startTs;
  while (chunkStart < now) {
    const span = Math.min(500, Math.ceil((now - chunkStart) / 86400));
    if (span <= 0) break;
    const res = await fetch(`https://coins.llama.fi/chart/base:${GHST}?start=${chunkStart}&span=${span}&period=1d`);
    if (!res.ok) throw new Error(`llama ${res.status}`);
    const json = await res.json();
    const prices: { timestamp: number; price: number }[] = json?.coins?.[`base:${GHST}`]?.prices ?? [];
    for (const p of prices) out.push({ day: dayKey(p.timestamp), metric: "ghst_price_usd", value: p.price });
    chunkStart += span * 86400;
  }
  return out; // chunk-edge duplicates collapse in the upsert
}

/** Today's forward-accruing snapshots. Each source fails independently. */
export async function fetchSnapshots(): Promise<MetricRow[]> {
  const day = dayKey(Math.floor(Date.now() / 1000));
  const out: MetricRow[] = [];
  try {
    const supply = await client.readContract({ address: GHST, abi: erc20Abi, functionName: "totalSupply" });
    out.push({ day, metric: "ghst_supply", value: Number(formatEther(supply)) });
  } catch (err) {
    console.warn("[pulse] supply snapshot failed:", err);
  }
  try {
    const res = await fetch(`https://base.blockscout.com/api/v2/tokens/${GHST}/counters`);
    if (res.ok) {
      const j = await res.json();
      const n = Number(j?.token_holders_count);
      if (n > 0) out.push({ day, metric: "ghst_holders", value: n });
    }
  } catch (err) {
    console.warn("[pulse] holders snapshot failed:", err);
  }
  try {
    const d = await gql(
      `{ erc721Listings(first: 1, where: { cancelled: false, timePurchased: "0", category: "3", priceInWei_gt: "0" }, orderBy: priceInWei, orderDirection: asc) { priceInWei } }`
    );
    const wei = d?.erc721Listings?.[0]?.priceInWei;
    if (wei) out.push({ day, metric: "gotchi_floor_ghst", value: Number(wei) / 1e18 });
  } catch (err) {
    console.warn("[pulse] floor snapshot failed:", err);
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/pulse/sources.ts
git commit -m "feat(pulse): verified network fetchers (subgraphs, llama, rpc, blockscout)"
```

---

### Task 6: Service, cron, route, app mount

**Files:**
- Create: `server/pulse/service.ts`
- Create: `server/pulse/cron.ts`
- Create: `server/routes/pulse.ts`
- Modify: `server/app.ts` (imports + mount + cron boot)

- [ ] **Step 1: Write the service**

```ts
// server/pulse/service.ts
/**
 * Pulse orchestration: one-time backfill into SQLite, nightly re-settle +
 * snapshots, and an in-memory payload cache. Quorum-style: /api/pulse serves
 * 202 while the first backfill runs, then always the cached payload.
 */
import { addDays, bucketSales, dayKey, dayStartTs } from "../../src/lib/pulse/aggregate";
import { buildPulsePayload, type PulsePayload } from "../../src/lib/pulse/payload";
import { getAllSeries, getMeta, setMeta, upsertMetrics } from "./store";
import { fetchLlamaDaily, fetchSales1155, fetchSales721, fetchSalesGbm, fetchSnapshots } from "./sources";

/** Day-aligned start of history. Predates Base Baazaar activity; earlier pages are empty. */
const BACKFILL_START_TS = Math.floor(Date.UTC(2024, 11, 1) / 1000); // 2024-12-01T00:00Z

let payload: PulsePayload | null = null;
let building = false;

function rebuildPayload(): void {
  payload = buildPulsePayload(getAllSeries(), Date.now());
}

/** Regenerates full-day sale aggregates from startTs (must be day-aligned - 1). */
async function ingestSales(startTs: number): Promise<void> {
  const endTs = Math.floor(Date.now() / 1000);
  const [a, b, c] = await Promise.all([
    fetchSales721(startTs, endTs),
    fetchSales1155(startTs, endTs),
    fetchSalesGbm(startTs, endTs),
  ]);
  upsertMetrics(bucketSales([...a, ...b, ...c]));
}

async function backfill(): Promise<void> {
  console.log("[pulse] backfill starting");
  await ingestSales(BACKFILL_START_TS - 1);
  upsertMetrics(await fetchLlamaDaily(BACKFILL_START_TS));
  upsertMetrics(await fetchSnapshots());
  setMeta("backfilled", "1");
  rebuildPayload();
  console.log("[pulse] backfill complete");
}

/** Re-settle the last 3 full days (late GBM claims etc.) + today's snapshots. */
export async function nightlyRefresh(): Promise<void> {
  const today = dayKey(Math.floor(Date.now() / 1000));
  const startTs = dayStartTs(addDays(today, -3)) - 1;
  await ingestSales(startTs);
  upsertMetrics(await fetchLlamaDaily(dayStartTs(addDays(today, -7))));
  upsertMetrics(await fetchSnapshots());
  rebuildPayload();
  console.log("[pulse] nightly refresh complete");
}

/** Boot entry: instant payload from disk when backfilled; else background backfill. */
export function ensureStarted(): void {
  if (payload || building) return;
  if (getMeta("backfilled")) {
    rebuildPayload();
    return;
  }
  building = true;
  backfill()
    .catch((err) => console.error("[pulse] backfill failed:", err))
    .finally(() => {
      building = false;
    });
}

export function getPulse(): { payload: PulsePayload | null; building: boolean } {
  if (!payload && !building) ensureStarted();
  return { payload, building: !payload };
}
```

- [ ] **Step 2: Write the cron**

```ts
// server/pulse/cron.ts
import cron from "node-cron";
import { ensureStarted, nightlyRefresh } from "./service";

let started = false;

export function startPulseCron() {
  if (started) return;
  started = true;
  // Kick the initial backfill (or instant disk load) without blocking boot.
  ensureStarted();
  // 03:10 UTC nightly: re-settle recent days + take forward-accruing snapshots.
  cron.schedule(
    "10 3 * * *",
    () => {
      nightlyRefresh().catch((err) => console.error("[pulse] nightly refresh failed:", err));
    },
    { timezone: "UTC" }
  );
}
```

- [ ] **Step 3: Write the route**

```ts
// server/routes/pulse.ts
import { Router } from "express";
import { getPulse } from "../pulse/service";

const router = Router();

// State-of-the-Aavegotchiverse payload. 202 while the initial backfill runs —
// the client polls until history lands (same contract as /api/dao/quorum).
router.get("/", (_req, res) => {
  const { payload, building } = getPulse();
  if (building || !payload) {
    res.status(202).json({ building: true });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(payload);
});

export default router;
```

- [ ] **Step 4: Mount in app.ts**

In `server/app.ts` add imports next to the existing ones:

```ts
import pulseRoutes from "./routes/pulse";
import { startPulseCron } from "./pulse/cron";
```

Add the mount after the `/api/map` line:

```ts
  // Pulse — state-of-the-Aavegotchiverse daily metrics, cached server-side.
  app.use("/api/pulse", pulseRoutes);
```

Add the cron boot after `startStewardCron();`:

```ts
  // Boot pulse backfill/refresh (backfills data/pulse.db on first run)
  startPulseCron();
```

- [ ] **Step 5: Typecheck + full unit suite**

Run: `pnpm typecheck` then `pnpm vitest run src/lib/pulse server/pulse`
Expected: both clean.

- [ ] **Step 6: Manual end-to-end check of the API**

Run `pnpm dev`, then poll:

```bash
curl -s http://localhost:3001/api/pulse   # check server port in server/index.ts first
```

Expected: `{"building":true}` (202) initially; after backfill completes (watch for `[pulse] backfill complete` in server logs, likely 1–3 min), a full JSON payload with non-empty `series.sales_volume_ghst`, `series.ghst_price_usd`, `verdicts` (4 entries), `windows.sales_volume_ghst_30d > 0`. Sanity: 30d volume should be same order of magnitude as the `/stats` page 30D figure.

- [ ] **Step 7: Commit**

```bash
git add server/pulse/service.ts server/pulse/cron.ts server/routes/pulse.ts server/app.ts
git commit -m "feat(pulse): backfill service, nightly cron, /api/pulse route"
```

---

### Task 7: Frontend /pulse page

**Files:**
- Create: `src/pages/PulsePage.tsx`
- Modify: `src/app/router.tsx` (lazy import + route)
- Modify: `src/components/layout/RootLayout.tsx` (nav entry)

Before writing the page, invoke the **dataviz** skill (chart form/color/interaction rules) — the code below is the structural baseline; let dataviz guidance refine colors and chart details. Check QuorumPanel.tsx's `env` import path and reuse it verbatim.

- [ ] **Step 1: Write the page**

```tsx
// src/pages/PulsePage.tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, Loader2, Info } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { env } from "@/lib/env"; // ← confirm against QuorumPanel.tsx import
import { addDays } from "@/lib/pulse/aggregate";
import type { PulsePayload } from "@/lib/pulse/payload";
import type { PulseVerdict, VerdictColor } from "@/lib/pulse/verdicts";

type PulseResponse = PulsePayload | { building: true };
const isBuilding = (d: PulseResponse | undefined): d is { building: true } => !!d && "building" in d;

async function fetchPulse(): Promise<PulseResponse> {
  const res = await fetch(`${env.companionApiUrl}/api/pulse`);
  if (res.status === 202) return { building: true };
  if (!res.ok) throw new Error(`pulse request failed: ${res.status}`);
  return res.json();
}

const WINDOWS = [
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "1Y", days: 365 },
  { key: "All", days: 0 },
] as const;

const fmtGhst = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtUsd = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDelta = (d: number | null) => (d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`);

const VERDICT_STYLE: Record<VerdictColor, string> = {
  green: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  red: "bg-red-500/15 text-red-500 border-red-500/40",
  accruing: "bg-muted/40 text-muted-foreground border-border/40",
};
const VERDICT_TEXT: Record<VerdictColor, string> = {
  green: "healthy", yellow: "softening", red: "shrinking", accruing: "accruing",
};

function VerdictChip({ v }: { v: VerdictColor }) {
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${VERDICT_STYLE[v]}`}>{VERDICT_TEXT[v]}</span>;
}

function HeroTile({ label, value, sub, delta, verdict, spark }: {
  label: string; value: string; sub?: string; delta?: number | null; verdict?: VerdictColor;
  spark?: { day: string; value: number }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {verdict && <VerdictChip v={verdict} />}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{sub}</span>
        {delta !== undefined && (
          <span className={`text-xs font-semibold ${delta != null && delta < 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtDelta(delta ?? null)} 30d</span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="h-10 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RealityLever({ verdicts, keys }: { verdicts: PulseVerdict[]; keys: string[] }) {
  const rows = verdicts.filter((v) => keys.includes(v.key));
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map((v) => (
        <div key={v.key} className="rounded-xl border border-border/40 bg-muted/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{v.label}</span>
            <VerdictChip v={v.verdict} />
          </div>
          <p className="text-xs text-muted-foreground">{v.ruleText}</p>
          <div className="mt-2 rounded-lg bg-primary/5 border border-primary/20 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-0.5">Lever · opinion, aspirational</div>
            <p className="text-xs">{v.lever}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PulsePage() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[1]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["pulse"],
    queryFn: fetchPulse,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (isBuilding(q.state.data) ? 5000 : false),
  });

  const p = !isBuilding(data) ? data : undefined;

  const slice = useMemo(() => {
    if (!p) return () => [] as { day: string; value: number }[];
    const lastDay = p.series.sales_volume_ghst?.at(-1)?.day ?? "";
    const from = win.days > 0 ? addDays(lastDay, -win.days) : "";
    return (key: string) => (p.series[key] ?? []).filter((pt) => pt.day >= from);
  }, [p, win]);

  const volumeChart = useMemo(() => {
    if (!p) return [];
    const usdByDay = new Map(slice("sales_volume_usd").map((x) => [x.day, x.value]));
    return slice("sales_ghst_gotchis").map((g, i) => ({
      day: g.day,
      gotchis: g.value,
      parcels: slice("sales_ghst_parcels")[i]?.value ?? 0,
      wearables: slice("sales_ghst_wearables")[i]?.value ?? 0,
      other: slice("sales_ghst_other")[i]?.value ?? 0,
      usd: usdByDay.get(g.day) ?? 0,
    }));
  }, [p, slice]);

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Pulse — State of the Aavegotchiverse" description="Daily GHST and marketplace health metrics for Aavegotchi on Base: price, volume, buyers, holders — with transparent health verdicts." canonical={siteUrl("/pulse")} />

      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-1">
        <HeartPulse className="w-6 h-6 text-primary" /> Pulse
      </h1>
      <p className="text-sm text-muted-foreground mb-5">State of the Aavegotchiverse — reality first, levers second. Chain: <span className="font-semibold text-foreground">Base</span></p>

      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}

      {isLoading || isBuilding(data) || !p ? (
        <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          {isBuilding(data) ? "Building history from the chain — first run takes a few minutes…" : "Loading…"}
        </div>
      ) : (
        <>
          {/* Hero tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HeroTile label="GHST price" value={fmtUsd(p.latest.ghst_price_usd ?? 0)} delta={p.deltas.ghst_price_usd?.mom} verdict={p.verdicts.find((v) => v.key === "ghst-price")?.verdict} spark={slice("ghst_price_usd")} />
            <HeroTile label="Market cap (approx)" value={fmtUsd(p.latest.ghst_mcap_usd ?? 0)} sub="price × current supply" spark={slice("ghst_mcap_usd")} />
            <HeroTile label="30d volume" value={`${fmtGhst(p.windows.sales_volume_ghst_30d)} GHST`} sub={`≈ ${fmtUsd(p.windows.sales_volume_usd_30d)}`} delta={p.deltas.sales_volume_ghst?.mom} verdict={p.verdicts.find((v) => v.key === "sales-volume")?.verdict} spark={slice("sales_volume_ghst")} />
            <HeroTile label="30d buyers" value={fmtGhst(p.windows.sales_buyers_30d)} sub={`${fmtGhst(p.windows.sales_count_30d)} sales`} delta={p.deltas.sales_buyers?.mom} verdict={p.verdicts.find((v) => v.key === "buyers")?.verdict} spark={slice("sales_buyers")} />
          </div>

          {/* Window toggle */}
          <div className="flex items-center gap-1.5 mt-6 mb-3">
            {WINDOWS.map((w) => (
              <button key={w.key} onClick={() => setWin(w)} className={`h-8 px-3.5 rounded-lg text-xs font-semibold border ${win.key === w.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{w.key}</button>
            ))}
          </div>

          {/* Sales section */}
          <section className="rounded-2xl border border-white/10 bg-muted/10 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Daily settled volume (GHST, by category)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtGhst(v)} width={48} />
                  <Tooltip formatter={(v: number, name: string) => [`${fmtGhst(v)} GHST`, name]} labelClassName="text-xs" contentStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="gotchis" stackId="v" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="wearables" stackId="v" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="parcels" stackId="v" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="other" stackId="v" stroke="#64748b" fill="#64748b" fillOpacity={0.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <MiniChart title="Unique buyers / day" data={slice("sales_buyers")} />
              <MiniChart title="Average sale (GHST)" data={slice("sales_avg_ghst")} />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["sales-volume", "buyers"]} />
          </section>

          {/* GHST section */}
          <section className="rounded-2xl border border-white/10 bg-muted/10 p-5 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">GHST price (USD)</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slice("ghst_price_usd")} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={48} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, "GHST"]} contentStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Accruing label="GHST supply (Base)" value={p.latest.ghst_supply} since={p.trackingSince.ghst_supply} fmt={(v) => `${fmtGhst(v)} GHST`} />
              <Accruing label="Holders (Base)" value={p.latest.ghst_holders} since={p.trackingSince.ghst_holders} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Gotchi floor" value={p.latest.gotchi_floor_ghst} since={p.trackingSince.gotchi_floor_ghst} fmt={(v) => `${fmtGhst(v)} GHST`} />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["ghst-price", "holders"]} />
          </section>

          {/* Methodology */}
          <details className="mt-4 rounded-2xl border border-border/40 bg-muted/10 p-5">
            <summary className="text-sm font-semibold cursor-pointer inline-flex items-center gap-2"><Info className="w-4 h-4" /> Methodology & data sources</summary>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>Sales: settled Baazaar ERC721/ERC1155 listings + settled GBM auctions on Base (Goldsky subgraphs), bucketed by UTC day. ERC1155 volume is price × quantity. Historical USD uses that day's GHST price (DefiLlama), never today's.</p>
              <p>"Unique buyers" windows sum daily unique addresses (an address active on N days counts N times). Supply via Base RPC; holders via Blockscout; floor = cheapest active gotchi listing. Supply, holders and floor accrue forward from the tracking-since date — no history exists before it.</p>
              <p className="font-semibold text-foreground">Verdict rules (computed, transparent):</p>
              <ul className="list-disc pl-5 space-y-1">
                {p.verdicts.map((v) => (<li key={v.key}><span className="font-medium text-foreground">{v.label}:</span> {v.ruleText}</li>))}
              </ul>
              <p>Levers are hand-written opinion about what would move each metric — aspirational by design, and labeled as such.</p>
              <p>Updated {new Date(p.updatedAt).toUTCString()}. Refreshes nightly at 03:10 UTC.</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function MiniChart({ title, data }: { title: string; data: { day: string; value: number }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-1">{title}</div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 9 }} minTickGap={50} />
            <YAxis tick={{ fontSize: 9 }} width={36} tickFormatter={(v: number) => fmtGhst(v)} />
            <Tooltip formatter={(v: number) => [fmtGhst(v), title]} contentStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Accruing({ label, value, since, fmt }: { label: string; value?: number; since?: string; fmt: (v: number) => string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value != null ? fmt(value) : "—"}</div>
      {since && <div className="text-[10px] text-muted-foreground">tracking since {since}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `src/app/router.tsx`, next to the StatsPage lazy import add:

```ts
const PulsePage = lazy(() => import("@/pages/PulsePage"));
```

and next to `{ path: "stats", element: <StatsPage /> },` add:

```ts
      { path: "pulse", element: <PulsePage /> },
```

- [ ] **Step 3: Add nav entry**

In `src/components/layout/RootLayout.tsx`, add `HeartPulse` to the lucide import and add after the Activity nav item:

```ts
  { to: "/pulse", title: "Pulse — State of the Aavegotchiverse", icon: HeartPulse },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PulsePage.tsx src/app/router.tsx src/components/layout/RootLayout.tsx
git commit -m "feat(pulse): /pulse state-of-the-Aavegotchiverse page"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Full unit suite + typecheck**

Run: `pnpm typecheck && pnpm vitest run`
Expected: clean; no regressions in existing suites.

- [ ] **Step 2: Drive the real page**

With `pnpm dev` running and backfill complete: open `http://localhost:5000/pulse` via Playwright MCP, wait for charts, screenshot. Verify: 4 hero tiles with values (not zeros), stacked volume chart has data, verdict chips render, Reality → Lever cards show the opinion badge, Methodology lists 4 rules, window toggle changes chart range, supply/holders/floor tiles show "tracking since {today}".

- [ ] **Step 3: Cross-check numbers**

Compare the payload's `windows.sales_volume_ghst_30d` against the `/stats` page 30D total (Baazaar + auctions). They should be within a few percent (Pulse counts full UTC days; /stats counts a rolling 30×24h window).

- [ ] **Step 4: Final commit if any fixes were made**

```bash
git add -A && git commit -m "fix(pulse): post-verification fixes"
```
