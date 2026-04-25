/**
 * Re-analyze the raw lending dump to:
 *   - separate open-market (whitelistId=0/null) from whitelisted/friend rentals
 *   - rank user's gotchis by modifiedRarityScore (BRS w/ wearables)
 *   - recommend a price band for the user's top gotchi
 *
 * Reads:  tmp/lending-last-30d.raw.json, tmp/user-gotchis.json
 * Writes: tmp/lending-last-30d.openmarket.json
 */
import fs from "fs";
import path from "path";

const RAW = path.resolve("tmp/lending-last-30d.raw.json");
const USER = path.resolve("tmp/user-gotchis.json");
const OUT = path.resolve("tmp/lending-last-30d.openmarket.json");

type Lending = {
  id: string;
  gotchiTokenId: string;
  gotchiBRS: string;
  period: string;
  rentDuration: string;
  upfrontCost: string;
  splitOwner: string;
  splitBorrower: string;
  splitOther: string;
  whitelistId: string | null;
  whitelist: { id: string; name: string | null } | null;
  borrower: string | null;
  channellingAllowed: boolean;
  completed: boolean;
  cancelled: boolean;
  timeAgreed: string;
  timeEnded: string;
  gotchi: { modifiedRarityScore: string; baseRarityScore: string; name: string | null } | null;
};

const lendings: Lending[] = JSON.parse(fs.readFileSync(RAW, "utf-8"));
const userGotchis: any[] = JSON.parse(fs.readFileSync(USER, "utf-8"));

const ghst = (wei: string) => Number(BigInt(wei || "0")) / 1e18;
const days = (s: string) => Number(s) / 86400;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function brsBucket(brs: number) {
  if (brs < 500) return "<500";
  if (brs < 530) return "500-529";
  if (brs < 570) return "530-569";
  if (brs < 600) return "570-599";
  if (brs < 630) return "600-629";
  if (brs < 660) return "630-659";
  if (brs < 700) return "660-699";
  return "700+";
}

function durBucket(s: number) {
  const d = s / 86400;
  if (d <= 1.01) return "1d";
  if (d <= 3.01) return "2-3d";
  if (d <= 7.01) return "4-7d";
  if (d <= 14.01) return "8-14d";
  if (d <= 31.01) return "15-31d";
  return ">31d";
}

const openMarket = lendings.filter((l) => !l.whitelistId || l.whitelistId === "0");
const whitelisted = lendings.filter((l) => l.whitelistId && l.whitelistId !== "0");

function statsBlock(items: Lending[]) {
  const total = items.length;
  if (!total) return { count: 0 };
  const prices = items.map((l) => ghst(l.upfrontCost)).sort((a, b) => a - b);
  const durs = items.map((l) => days(l.period)).sort((a, b) => a - b);
  const brss = items.map((l) => Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0));
  const splitsBorrower = items.map((l) => Number(l.splitBorrower || 0));
  const channelling = items.filter((l) => l.channellingAllowed).length;

  return {
    count: total,
    priceGhst: {
      zeroCount: prices.filter((p) => p === 0).length,
      nonZero: {
        n: prices.filter((p) => p > 0).length,
        min: prices.find((p) => p > 0) ?? 0,
        median: quantile(prices.filter((p) => p > 0), 0.5),
        p75: quantile(prices.filter((p) => p > 0), 0.75),
        p90: quantile(prices.filter((p) => p > 0), 0.9),
        max: prices[prices.length - 1],
        mean: prices.filter((p) => p > 0).reduce((a, b) => a + b, 0) /
          Math.max(1, prices.filter((p) => p > 0).length),
      },
    },
    durationDays: {
      min: durs[0],
      median: quantile(durs, 0.5),
      p75: quantile(durs, 0.75),
      max: durs[durs.length - 1],
    },
    splitBorrowerPct: {
      median: quantile([...splitsBorrower].sort((a, b) => a - b), 0.5),
      mean: splitsBorrower.reduce((a, b) => a + b, 0) / splitsBorrower.length,
    },
    channellingAllowedPct: Math.round((channelling / total) * 1000) / 10,
  };
}

function bucketBreakdown(items: Lending[]) {
  const map: Record<string, Lending[]> = {};
  for (const l of items) {
    const brs = Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0);
    const dur = Number(l.period || 0);
    const key = `${brsBucket(brs)} | ${durBucket(dur)}`;
    (map[key] ||= []).push(l);
  }
  return Object.entries(map)
    .map(([k, v]) => {
      const prices = v.map((l) => ghst(l.upfrontCost)).sort((a, b) => a - b);
      const nonZero = prices.filter((p) => p > 0);
      return {
        bucket: k,
        n: v.length,
        zeroPriceCount: prices.length - nonZero.length,
        nonZeroN: nonZero.length,
        median: quantile(nonZero, 0.5),
        p75: quantile(nonZero, 0.75),
        p90: quantile(nonZero, 0.9),
        max: prices[prices.length - 1],
        avgSplitBorrower:
          Math.round(
            (v.reduce((a, l) => a + Number(l.splitBorrower || 0), 0) / v.length) * 10
          ) / 10,
      };
    })
    .sort((a, b) => b.n - a.n);
}

const userTop = [...userGotchis]
  .map((g) => ({
    gotchiId: g.gotchiId,
    name: g.name,
    baseBRS: Number(g.baseRarityScore),
    modBRS: Number(g.modifiedRarityScore),
    level: Number(g.level),
    listedForLending: g.lending && Number(g.lending) > 0,
  }))
  .sort((a, b) => b.modBRS - a.modBRS)
  .slice(0, 15);

// for each top gotchi, compute "comparable" open-market band based on BRS within +-25
const userRecommendations = userTop.slice(0, 5).map((g) => {
  const comps = openMarket.filter((l) => {
    const brs = Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0);
    return Math.abs(brs - g.modBRS) <= 25;
  });
  const compsShort = comps.filter((l) => {
    const d = days(l.period);
    return d >= 0.9 && d <= 7.5;
  });
  const compsShortPaid = compsShort.filter((l) => ghst(l.upfrontCost) > 0);
  const prices = compsShortPaid.map((l) => ghst(l.upfrontCost)).sort((a, b) => a - b);
  return {
    gotchi: g,
    comparables: {
      sameBrsBandAnyDuration: comps.length,
      sameBrsBand1to7d: compsShort.length,
      sameBrsBand1to7dPaidOnly: compsShortPaid.length,
    },
    recommendedUpfrontGhst: prices.length
      ? {
          conservative: quantile(prices, 0.5),
          target: quantile(prices, 0.75),
          aggressive: quantile(prices, 0.9),
          recentSamples: compsShortPaid
            .map((l) => ({
              ghst: ghst(l.upfrontCost),
              brs: Number(l.gotchiBRS),
              days: Math.round(days(l.period) * 10) / 10,
              splitBorrower: Number(l.splitBorrower),
              channelling: l.channellingAllowed,
              gotchiId: l.gotchiTokenId,
              ts: new Date(Number(l.timeAgreed) * 1000).toISOString().slice(0, 10),
            }))
            .slice(-10),
        }
      : null,
  };
});

const out = {
  windowDays: 30,
  totalsByMarket: {
    openMarket: openMarket.length,
    whitelisted: whitelisted.length,
  },
  openMarket: {
    overall: statsBlock(openMarket),
    byBucket: bucketBreakdown(openMarket).slice(0, 30),
  },
  whitelisted: {
    overall: statsBlock(whitelisted),
    byBucket: bucketBreakdown(whitelisted).slice(0, 15),
  },
  userTopByModBRS: userTop,
  userRecommendations,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log("\n=== OPEN-MARKET (whitelistId=0) ===");
console.log(JSON.stringify(out.openMarket.overall, null, 2));
console.log("\nOpen-market by bucket:");
console.table(out.openMarket.byBucket);

console.log("\n=== WHITELISTED ===");
console.log(JSON.stringify(out.whitelisted.overall, null, 2));

console.log("\n=== USER GOTCHIS — TOP 15 BY BRS w/ WEARABLES ===");
console.table(userTop);

console.log("\n=== RECOMMENDATION FOR TOP 5 GOTCHIS ===");
for (const r of userRecommendations) {
  console.log(`\n${r.gotchi.name} (#${r.gotchi.gotchiId}, modBRS ${r.gotchi.modBRS}):`);
  console.log(`  comps: ${r.comparables.sameBrsBand1to7dPaidOnly} paid open-market 1-7d w/in ±25 BRS`);
  if (r.recommendedUpfrontGhst) {
    console.log(`  upfront GHST: conservative=${r.recommendedUpfrontGhst.conservative}, target=${r.recommendedUpfrontGhst.target}, aggressive=${r.recommendedUpfrontGhst.aggressive}`);
    console.log(`  recent samples:`);
    for (const s of r.recommendedUpfrontGhst.recentSamples) {
      console.log(`    #${s.gotchiId} BRS=${s.brs} ${s.days}d ${s.ghst}GHST split-borrower=${s.splitBorrower}% channelling=${s.channelling} (${s.ts})`);
    }
  } else {
    console.log("  no paid comparables; consider 0 GHST + revenue split");
  }
}

console.log(`\nWrote: ${OUT}`);
