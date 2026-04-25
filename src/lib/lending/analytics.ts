import type { HistoricalLending } from "@/hooks/useHistoricalLendings";
import { BRS_BANDS, DURATION_BUCKETS, brsBandOf, durationBucketOf } from "./types";

export function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export type HeatCell = {
  brsBand: string;
  durBucket: string;
  count: number;
  median: number; // GHST upfront, paid lendings only
  p75: number;
  p90: number;
  paidCount: number;
};

export function buildPriceHeatmap(lendings: HistoricalLending[]): HeatCell[] {
  // Open-market only (non-zero, non-whitelisted) for the heatmap signal.
  const open = lendings.filter(
    (l) => (!l.whitelistId || l.whitelistId === "0") && l.upfrontGhst > 0
  );
  const map = new Map<string, HistoricalLending[]>();
  for (const l of open) {
    const k = `${brsBandOf(l.gotchiBRS)}|${durationBucketOf(l.period)}`;
    const arr = map.get(k);
    if (arr) arr.push(l);
    else map.set(k, [l]);
  }
  const cells: HeatCell[] = [];
  for (const b of BRS_BANDS) {
    for (const d of DURATION_BUCKETS) {
      const k = `${b.label}|${d.label}`;
      const items = map.get(k) ?? [];
      const prices = items.map((x) => x.upfrontGhst).sort((a, b) => a - b);
      cells.push({
        brsBand: b.label,
        durBucket: d.label,
        count: items.length,
        paidCount: prices.length,
        median: quantile(prices, 0.5),
        p75: quantile(prices, 0.75),
        p90: quantile(prices, 0.9),
      });
    }
  }
  return cells;
}

export type DailyVolume = {
  dateLabel: string;
  unix: number;
  agreed: number;
  completed: number;
  cancelled: number;
  upfrontGhst: number; // sum on that day
};

export function buildDailyVolume(
  lendings: HistoricalLending[],
  days: number
): DailyVolume[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startUnix = Math.floor(today.getTime() / 1000) - (days - 1) * 86400;

  const buckets = new Map<number, DailyVolume>();
  for (let i = 0; i < days; i++) {
    const unix = startUnix + i * 86400;
    const d = new Date(unix * 1000);
    const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    buckets.set(unix, {
      dateLabel,
      unix,
      agreed: 0,
      completed: 0,
      cancelled: 0,
      upfrontGhst: 0,
    });
  }

  for (const l of lendings) {
    if (l.timeAgreed >= startUnix) {
      const dayUnix = l.timeAgreed - (l.timeAgreed % 86400);
      const b = buckets.get(dayUnix);
      if (b) {
        b.agreed += 1;
        b.upfrontGhst += l.upfrontGhst;
      }
    }
    if (l.completed && l.timeEnded >= startUnix) {
      const dayUnix = l.timeEnded - (l.timeEnded % 86400);
      const b = buckets.get(dayUnix);
      if (b) b.completed += 1;
    }
    if (l.cancelled && l.timeCreated >= startUnix) {
      const dayUnix = l.timeCreated - (l.timeCreated % 86400);
      const b = buckets.get(dayUnix);
      if (b) b.cancelled += 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.unix - b.unix);
}

export type WhitelistStat = {
  whitelistId: string;
  name: string | null;
  count: number;
  paidCount: number;
  medianGhst: number;
  totalGhst: number;
};

export function buildWhitelistLeaderboard(
  lendings: HistoricalLending[]
): WhitelistStat[] {
  const map = new Map<string, { name: string | null; ghst: number[]; total: number }>();
  for (const l of lendings) {
    const id = l.whitelistId || "0";
    let entry = map.get(id);
    if (!entry) {
      entry = { name: l.whitelistName, ghst: [], total: 0 };
      map.set(id, entry);
    }
    if (!entry.name && l.whitelistName) entry.name = l.whitelistName;
    entry.ghst.push(l.upfrontGhst);
    entry.total += l.upfrontGhst;
  }
  return Array.from(map.entries())
    .map(([id, v]) => {
      const paid = v.ghst.filter((p) => p > 0).sort((a, b) => a - b);
      return {
        whitelistId: id,
        name: id === "0" ? "Open Market" : v.name,
        count: v.ghst.length,
        paidCount: paid.length,
        medianGhst: quantile(paid, 0.5),
        totalGhst: v.total,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export type AddressStat = {
  address: string;
  count: number;
  totalGhst: number;
};

export function buildBorrowerLeaderboard(
  lendings: HistoricalLending[]
): AddressStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const l of lendings) {
    if (!l.borrower) continue;
    const cur = map.get(l.borrower) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += l.upfrontGhst;
    map.set(l.borrower, cur);
  }
  return Array.from(map.entries())
    .map(([address, v]) => ({ address, count: v.count, totalGhst: v.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

export function buildLenderLeaderboard(
  lendings: HistoricalLending[]
): AddressStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const l of lendings) {
    const cur = map.get(l.lender) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += l.upfrontGhst;
    map.set(l.lender, cur);
  }
  return Array.from(map.entries())
    .map(([address, v]) => ({ address, count: v.count, totalGhst: v.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

export type SuggestedPrice = {
  brs: number;
  band: string;
  matchTier: "band+bucket" | "band" | "wide" | "closest" | "none";
  matchDescription: string;
  durationBucket: string;
  comparablesCount: number;
  paidCount: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  recentSamples: {
    ghst: number;
    days: number;
    brs: number;
    band: string;
    date: string;
    channelling: boolean;
    splitBorrower: number;
  }[];
};

export function suggestPrice(
  lendings: HistoricalLending[],
  brs: number,
  durationDays: number
): SuggestedPrice {
  const targetSec = durationDays * 86400;
  const userBand = brsBandOf(brs);
  const userBucket = durationBucketOf(targetSec);

  const open = lendings.filter(
    (l) => (!l.whitelistId || l.whitelistId === "0") && l.upfrontGhst > 0
  );

  let comps: HistoricalLending[] = [];
  let matchTier: SuggestedPrice["matchTier"] = "none";
  let matchDescription = "no comparable rentals";

  // Tier 1: same band + same duration bucket
  comps = open.filter(
    (l) =>
      brsBandOf(l.gotchiBRS) === userBand && durationBucketOf(l.period) === userBucket
  );
  if (comps.length >= 3) {
    matchTier = "band+bucket";
    matchDescription = `${userBand} BRS · ${userBucket}`;
  } else {
    // Tier 2: same band, any duration
    const inBand = open.filter((l) => brsBandOf(l.gotchiBRS) === userBand);
    if (inBand.length >= 3) {
      comps = inBand;
      matchTier = "band";
      matchDescription = `${userBand} BRS · any duration`;
    } else {
      // Tier 3: nearby ±100 BRS
      const wide = open.filter((l) => Math.abs(l.gotchiBRS - brs) <= 100);
      if (wide.length >= 3) {
        comps = wide;
        matchTier = "wide";
        matchDescription = `BRS ${Math.max(0, brs - 100)}–${brs + 100}`;
      } else {
        // Tier 4: closest 10 by BRS distance — best-effort
        const closest = [...open]
          .sort((a, b) => Math.abs(a.gotchiBRS - brs) - Math.abs(b.gotchiBRS - brs))
          .slice(0, 10);
        if (closest.length > 0) {
          comps = closest;
          matchTier = "closest";
          matchDescription = `closest ${closest.length} by BRS`;
        }
      }
    }
  }

  const prices = comps.map((c) => c.upfrontGhst).sort((a, b) => a - b);

  return {
    brs,
    band: userBand,
    matchTier,
    matchDescription,
    durationBucket: userBucket,
    comparablesCount: comps.length,
    paidCount: prices.length,
    median: quantile(prices, 0.5),
    p75: quantile(prices, 0.75),
    p90: quantile(prices, 0.9),
    max: prices[prices.length - 1] ?? 0,
    recentSamples: comps
      .sort((a, b) => b.timeAgreed - a.timeAgreed)
      .slice(0, 8)
      .map((c) => ({
        ghst: c.upfrontGhst,
        days: Math.round((c.period / 86400) * 10) / 10,
        brs: c.gotchiBRS,
        band: brsBandOf(c.gotchiBRS),
        date: new Date(c.timeAgreed * 1000).toISOString().slice(0, 10),
        channelling: c.channellingAllowed,
        splitBorrower: c.splitBorrower,
      })),
  };
}

export type HeroStats = {
  agreed30d: number;
  completed30d: number;
  cancelled30d: number;
  totalUpfrontGhst30d: number;
  medianUpfrontPaid: number;
  channellingAllowedPct: number;
};

export function buildHeroStats(lendings: HistoricalLending[]): HeroStats {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
  const recent = lendings.filter((l) => l.timeAgreed >= cutoff);
  const completed = recent.filter((l) => l.completed).length;
  const cancelled = recent.filter((l) => l.cancelled).length;
  const totalGhst = recent.reduce((s, l) => s + l.upfrontGhst, 0);
  const channelling = recent.filter((l) => l.channellingAllowed).length;
  const paid = recent
    .filter((l) => l.upfrontGhst > 0 && (!l.whitelistId || l.whitelistId === "0"))
    .map((l) => l.upfrontGhst)
    .sort((a, b) => a - b);
  return {
    agreed30d: recent.length,
    completed30d: completed,
    cancelled30d: cancelled,
    totalUpfrontGhst30d: totalGhst,
    medianUpfrontPaid: quantile(paid, 0.5),
    channellingAllowedPct: recent.length
      ? Math.round((channelling / recent.length) * 1000) / 10
      : 0,
  };
}

// Filter lendings by an address — match lender, borrower, or originalOwner.
export function filterByAddress(
  lendings: HistoricalLending[],
  address: string | null
): HistoricalLending[] {
  if (!address) return lendings;
  const a = address.toLowerCase();
  return lendings.filter(
    (l) =>
      l.lender.toLowerCase() === a ||
      (l.borrower && l.borrower.toLowerCase() === a)
  );
}

// Distribution histogram — log-ish buckets for prices.
export type HistogramBin = {
  label: string;
  min: number;
  max: number;
  count: number;
};

export function buildPriceHistogram(
  lendings: HistoricalLending[]
): HistogramBin[] {
  const paid = lendings
    .filter((l) => l.upfrontGhst > 0)
    .map((l) => l.upfrontGhst);
  // log-style buckets
  const edges = [0, 1, 5, 10, 25, 50, 100, 200, 400, 1000, Infinity];
  const labels = ["0-1", "1-5", "5-10", "10-25", "25-50", "50-100", "100-200", "200-400", "400-1k", "1k+"];
  const bins: HistogramBin[] = labels.map((label, i) => ({
    label,
    min: edges[i],
    max: edges[i + 1],
    count: 0,
  }));
  for (const v of paid) {
    for (let i = 0; i < bins.length; i++) {
      if (v >= bins[i].min && v < bins[i].max) {
        bins[i].count += 1;
        break;
      }
    }
  }
  return bins;
}

export function buildDurationHistogram(
  lendings: HistoricalLending[]
): HistogramBin[] {
  const labels = ["≤1d", "2-3d", "4-7d", "8-14d", "15-31d", ">31d"];
  const edges = [0, 86400 * 1.01, 86400 * 3.01, 86400 * 7.01, 86400 * 14.01, 86400 * 31.01, Infinity];
  const bins: HistogramBin[] = labels.map((label, i) => ({
    label,
    min: edges[i],
    max: edges[i + 1],
    count: 0,
  }));
  for (const l of lendings) {
    const v = l.period;
    for (let i = 0; i < bins.length; i++) {
      if (v >= bins[i].min && v < bins[i].max) {
        bins[i].count += 1;
        break;
      }
    }
  }
  return bins;
}

export function buildBRSHistogram(
  lendings: HistoricalLending[]
): HistogramBin[] {
  const labels = ["<500", "500-529", "530-569", "570-599", "600-629", "630-659", "660-699", "700+"];
  const edges = [0, 500, 530, 570, 600, 630, 660, 700, Infinity];
  const bins: HistogramBin[] = labels.map((label, i) => ({
    label,
    min: edges[i],
    max: edges[i + 1],
    count: 0,
  }));
  for (const l of lendings) {
    const v = l.gotchiBRS;
    for (let i = 0; i < bins.length; i++) {
      if (v >= bins[i].min && v < bins[i].max) {
        bins[i].count += 1;
        break;
      }
    }
  }
  return bins;
}

// Channelling premium: per BRS band, compare median GHST with vs without channelling.
export type ChannellingComparison = {
  brsBand: string;
  withChannelling: { count: number; median: number };
  withoutChannelling: { count: number; median: number };
  premiumPct: number | null; // (with - without) / without * 100; null if either side empty
};

export function buildChannellingComparison(
  lendings: HistoricalLending[]
): ChannellingComparison[] {
  // open-market paid only for cleanest signal
  const paid = lendings.filter(
    (l) => (!l.whitelistId || l.whitelistId === "0") && l.upfrontGhst > 0
  );
  const result: ChannellingComparison[] = [];
  for (const b of BRS_BANDS) {
    const inBand = paid.filter((l) => l.gotchiBRS >= b.min && l.gotchiBRS < b.max);
    const withCh = inBand.filter((l) => l.channellingAllowed).map((l) => l.upfrontGhst).sort((a, b) => a - b);
    const withoutCh = inBand.filter((l) => !l.channellingAllowed).map((l) => l.upfrontGhst).sort((a, b) => a - b);
    const wMed = quantile(withCh, 0.5);
    const woMed = quantile(withoutCh, 0.5);
    const premiumPct = withCh.length > 0 && withoutCh.length > 0 && woMed > 0
      ? ((wMed - woMed) / woMed) * 100
      : null;
    result.push({
      brsBand: b.label,
      withChannelling: { count: withCh.length, median: wMed },
      withoutChannelling: { count: withoutCh.length, median: woMed },
      premiumPct,
    });
  }
  return result;
}

// Top gotchis: by rental count and by total earnings (lender side).
export type GotchiStat = {
  tokenId: string;
  name: string | null;
  modBRS: number;
  count: number;
  totalGhstEarned: number; // sum of upfrontCost for all rentals of this gotchi
  averageGhst: number;
  channellingAllowedPct: number;
  lastSeen: number;
  // Most recent lending row for rendering its current SVG
  sample: HistoricalLending | null;
};

export function buildTopGotchis(
  lendings: HistoricalLending[]
): GotchiStat[] {
  const map = new Map<string, GotchiStat>();
  for (const l of lendings) {
    let s = map.get(l.gotchiTokenId);
    if (!s) {
      s = {
        tokenId: l.gotchiTokenId,
        name: l.gotchiName,
        modBRS: l.gotchiModifiedRarityScore || l.gotchiBRS,
        count: 0,
        totalGhstEarned: 0,
        averageGhst: 0,
        channellingAllowedPct: 0,
        lastSeen: 0,
        sample: l,
      };
      map.set(l.gotchiTokenId, s);
    }
    s.count += 1;
    s.totalGhstEarned += l.upfrontGhst;
    if (l.timeAgreed > s.lastSeen) {
      s.lastSeen = l.timeAgreed;
      s.sample = l;
    }
  }
  // finalize avg + channelling pct
  for (const s of map.values()) {
    const items = lendings.filter((l) => l.gotchiTokenId === s.tokenId);
    const channelling = items.filter((l) => l.channellingAllowed).length;
    s.channellingAllowedPct = items.length ? Math.round((channelling / items.length) * 1000) / 10 : 0;
    s.averageGhst = s.count > 0 ? s.totalGhstEarned / s.count : 0;
  }
  return Array.from(map.values());
}

// Full per-band statistics (paid open-market only).
export type BandStat = {
  band: string;
  count: number;
  paidCount: number;
  zeroCount: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
  totalGhst: number;
  channellingPct: number;
};

export function buildBandStats(
  lendings: HistoricalLending[]
): BandStat[] {
  const out: BandStat[] = [];
  for (const b of BRS_BANDS) {
    const inBand = lendings.filter((l) => l.gotchiBRS >= b.min && l.gotchiBRS < b.max);
    const open = inBand.filter((l) => !l.whitelistId || l.whitelistId === "0");
    const paid = open.filter((l) => l.upfrontGhst > 0).map((l) => l.upfrontGhst).sort((a, b) => a - b);
    const channelling = inBand.filter((l) => l.channellingAllowed).length;
    out.push({
      band: b.label,
      count: inBand.length,
      paidCount: paid.length,
      zeroCount: inBand.length - paid.length,
      min: paid[0] ?? 0,
      p25: quantile(paid, 0.25),
      median: quantile(paid, 0.5),
      p75: quantile(paid, 0.75),
      p90: quantile(paid, 0.9),
      max: paid[paid.length - 1] ?? 0,
      mean: paid.length ? paid.reduce((a, b) => a + b, 0) / paid.length : 0,
      totalGhst: inBand.reduce((s, l) => s + l.upfrontGhst, 0),
      channellingPct: inBand.length ? Math.round((channelling / inBand.length) * 1000) / 10 : 0,
    });
  }
  return out;
}

// Recent lendings feed (sorted by timeAgreed desc).
export function recentLendings(
  lendings: HistoricalLending[],
  limit = 30
): HistoricalLending[] {
  return [...lendings]
    .sort((a, b) => b.timeAgreed - a.timeAgreed)
    .slice(0, limit);
}

// Filter lendings to those matching a heatmap cell (BRS band × duration bucket).
export function lendingsInCell(
  lendings: HistoricalLending[],
  brsBand: string,
  durBucket: string
): HistoricalLending[] {
  const band = BRS_BANDS.find((b) => b.label === brsBand);
  if (!band) return [];
  const dur = DURATION_BUCKETS.find((d) => d.label === durBucket);
  if (!dur) return [];
  const idx = DURATION_BUCKETS.findIndex((d) => d.label === durBucket);
  const prevMax = idx > 0 ? DURATION_BUCKETS[idx - 1].maxSec : 0;
  return lendings.filter((l) => {
    if (l.gotchiBRS < band.min || l.gotchiBRS >= band.max) return false;
    if (l.period <= prevMax || l.period > dur.maxSec) return false;
    return true;
  });
}
