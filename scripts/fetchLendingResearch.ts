/**
 * Fetch all GotchiLendings agreed in the last N days from the Aavegotchi Base subgraph,
 * plus the requesting user's gotchis with current modifiedRarityScore (BRS w/ wearables).
 *
 * Output:
 *   tmp/lending-last-30d.raw.json   — raw lending records
 *   tmp/lending-last-30d.summary.json — bucketed aggregations
 *   tmp/user-gotchis.json — user's gotchis with BRS
 *
 * Usage: npx tsx scripts/fetchLendingResearch.ts [--days=30] [--owner=0x...]
 */
import fs from "fs";
import path from "path";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"])
);

const DAYS = Number(args.days || 30);
const OWNER = (args.owner || "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96").toLowerCase();
const NOW = Math.floor(Date.now() / 1000);
const SINCE = NOW - DAYS * 24 * 60 * 60;
const PAGE = 1000;

const OUT_DIR = path.resolve("tmp");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

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
  tokensToShare: string[];
  whitelistId: string | null;
  whitelist: { id: string; name: string | null } | null;
  thirdPartyAddress: string | null;
  borrower: string | null;
  lender: string;
  originalOwner: string;
  cancelled: boolean;
  completed: boolean;
  channellingAllowed: boolean;
  timeAgreed: string;
  timeCreated: string;
  timeEnded: string;
  gotchi: {
    id: string;
    name: string | null;
    baseRarityScore: string;
    modifiedRarityScore: string;
    equippedWearables: string[];
    kinship: string;
    level: string;
  } | null;
};

const LENDING_QUERY = `
  query Lendings($since: BigInt!, $lastId: ID!) {
    gotchiLendings(
      first: 1000
      where: {
        timeAgreed_gt: $since
        id_gt: $lastId
      }
      orderBy: id
      orderDirection: asc
    ) {
      id
      gotchiTokenId
      gotchiBRS
      period
      rentDuration
      upfrontCost
      splitOwner
      splitBorrower
      splitOther
      tokensToShare
      whitelistId
      whitelist { id name }
      thirdPartyAddress
      borrower
      lender
      originalOwner
      cancelled
      completed
      channellingAllowed
      timeAgreed
      timeCreated
      timeEnded
      gotchi {
        id
        name
        baseRarityScore
        modifiedRarityScore
        equippedWearables
        kinship
        level
      }
    }
  }
`;

async function fetchAllLendings(): Promise<Lending[]> {
  let all: Lending[] = [];
  let lastId = "";
  let page = 0;
  while (true) {
    const data = await gql<{ gotchiLendings: Lending[] }>(LENDING_QUERY, {
      since: String(SINCE),
      lastId,
    });
    const batch = data.gotchiLendings;
    if (!batch.length) break;
    all = all.concat(batch);
    page += 1;
    console.log(`  page ${page}: +${batch.length} (total ${all.length})`);
    if (batch.length < PAGE) break;
    lastId = batch[batch.length - 1].id;
  }
  return all;
}

const USER_QUERY = `
  query UserGotchis($owner: ID!) {
    user(id: $owner) {
      id
      gotchisOwned(first: 1000) {
        id
        gotchiId
        name
        baseRarityScore
        modifiedRarityScore
        equippedWearables
        kinship
        level
        lending
      }
    }
  }
`;

async function fetchUserGotchis(owner: string) {
  const data = await gql<{ user: { gotchisOwned: any[] } | null }>(USER_QUERY, { owner });
  return data.user?.gotchisOwned ?? [];
}

function brsBucket(brs: number): string {
  if (brs < 350) return "<350";
  if (brs < 450) return "350-449";
  if (brs < 500) return "450-499";
  if (brs < 530) return "500-529 Mythical";
  if (brs < 600) return "530-599 Godlike";
  if (brs < 650) return "600-649 Godlike";
  return "650+ Godlike+";
}

function durationBucket(seconds: number): string {
  const days = seconds / 86400;
  if (days <= 1.01) return "≤1d";
  if (days <= 3.01) return "2-3d";
  if (days <= 7.01) return "4-7d";
  if (days <= 14.01) return "8-14d";
  if (days <= 31.01) return "15-31d";
  return ">31d";
}

function ghst(weiStr: string): number {
  const wei = BigInt(weiStr || "0");
  return Number(wei) / 1e18;
}

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(lendings: Lending[]) {
  const total = lendings.length;
  const completed = lendings.filter((l) => l.completed).length;
  const cancelled = lendings.filter((l) => l.cancelled).length;
  const channelling = lendings.filter((l) => l.channellingAllowed).length;
  const open = lendings.filter((l) => !l.whitelistId || l.whitelistId === "0").length;

  // by bucket
  const byBucket: Record<
    string,
    { count: number; prices: number[]; brsList: number[]; durations: number[] }
  > = {};
  for (const l of lendings) {
    const brs = Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0);
    const dur = Number(l.period || 0);
    const price = ghst(l.upfrontCost);
    const key = `${brsBucket(brs)} | ${durationBucket(dur)}`;
    if (!byBucket[key]) byBucket[key] = { count: 0, prices: [], brsList: [], durations: [] };
    const b = byBucket[key];
    b.count += 1;
    b.prices.push(price);
    b.brsList.push(brs);
    b.durations.push(dur);
  }

  const buckets = Object.entries(byBucket)
    .map(([key, v]) => {
      const sortedPrice = [...v.prices].sort((a, b) => a - b);
      return {
        bucket: key,
        count: v.count,
        priceGhst: {
          min: sortedPrice[0],
          p25: quantile(sortedPrice, 0.25),
          median: quantile(sortedPrice, 0.5),
          p75: quantile(sortedPrice, 0.75),
          p90: quantile(sortedPrice, 0.9),
          max: sortedPrice[sortedPrice.length - 1],
          mean: sortedPrice.reduce((a, b) => a + b, 0) / sortedPrice.length,
        },
        brs: {
          min: Math.min(...v.brsList),
          max: Math.max(...v.brsList),
          mean: Math.round(v.brsList.reduce((a, b) => a + b, 0) / v.brsList.length),
        },
      };
    })
    .sort((a, b) => b.count - a.count);

  // top whitelists
  const wlMap = new Map<string, { count: number; name: string | null; prices: number[] }>();
  for (const l of lendings) {
    const id = l.whitelistId || "0";
    if (!wlMap.has(id))
      wlMap.set(id, { count: 0, name: l.whitelist?.name || null, prices: [] });
    const e = wlMap.get(id)!;
    e.count += 1;
    e.prices.push(ghst(l.upfrontCost));
    if (l.whitelist?.name) e.name = l.whitelist.name;
  }
  const topWhitelists = [...wlMap.entries()]
    .map(([id, v]) => ({
      whitelistId: id,
      name: v.name,
      count: v.count,
      medianPriceGhst: quantile([...v.prices].sort((a, b) => a - b), 0.5),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // battler-style heuristic: short duration (1-7d), high BRS, channelling not required, open or popular whitelist
  const battlerCandidates = lendings.filter((l) => {
    const dur = Number(l.period || 0);
    const brs = Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0);
    const days = dur / 86400;
    return days >= 0.9 && days <= 7.5 && brs >= 500;
  });
  const battlerPrices = battlerCandidates
    .map((l) => ghst(l.upfrontCost))
    .sort((a, b) => a - b);

  const battlerByBrs: Record<string, number[]> = {};
  for (const l of battlerCandidates) {
    const brs = Number(l.gotchiBRS || l.gotchi?.modifiedRarityScore || 0);
    const k = brsBucket(brs);
    (battlerByBrs[k] ||= []).push(ghst(l.upfrontCost));
  }
  const battlerByBrsSummary = Object.entries(battlerByBrs).map(([k, prices]) => {
    const s = [...prices].sort((a, b) => a - b);
    return {
      brsBucket: k,
      count: s.length,
      median: quantile(s, 0.5),
      p75: quantile(s, 0.75),
      p90: quantile(s, 0.9),
      max: s[s.length - 1],
    };
  }).sort((a, b) => a.brsBucket.localeCompare(b.brsBucket));

  return {
    windowDays: DAYS,
    sinceUnix: SINCE,
    fetchedAtUnix: NOW,
    totals: {
      lendingsAgreed: total,
      completed,
      cancelled,
      stillActive: total - completed - cancelled,
      channellingAllowedPct: pct(channelling / total),
      openWhitelistPct: pct(open / total),
    },
    buckets,
    topWhitelists,
    battlerCandidates: {
      filter: "duration 1-7d AND BRS>=500",
      count: battlerCandidates.length,
      priceGhst: {
        min: battlerPrices[0],
        p25: quantile(battlerPrices, 0.25),
        median: quantile(battlerPrices, 0.5),
        p75: quantile(battlerPrices, 0.75),
        p90: quantile(battlerPrices, 0.9),
        max: battlerPrices[battlerPrices.length - 1],
      },
      byBrsBucket: battlerByBrsSummary,
    },
  };
}

async function main() {
  console.log(`Fetching lendings since ${new Date(SINCE * 1000).toISOString()} (${DAYS} days)...`);
  const lendings = await fetchAllLendings();
  console.log(`Fetched ${lendings.length} lendings.`);

  console.log(`Fetching gotchis owned by ${OWNER}...`);
  const userGotchis = await fetchUserGotchis(OWNER);
  console.log(`User has ${userGotchis.length} gotchis.`);

  const summary = summarize(lendings);

  fs.writeFileSync(path.join(OUT_DIR, "lending-last-30d.raw.json"), JSON.stringify(lendings, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "lending-last-30d.summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "user-gotchis.json"), JSON.stringify(userGotchis, null, 2));

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary.totals, null, 2));
  console.log("\nTop 10 buckets by count:");
  console.table(
    summary.buckets.slice(0, 10).map((b) => ({
      bucket: b.bucket,
      n: b.count,
      median: b.priceGhst.median.toFixed(2),
      p75: b.priceGhst.p75.toFixed(2),
      p90: b.priceGhst.p90.toFixed(2),
      meanBRS: b.brs.mean,
    }))
  );
  console.log("\nBattler-style band (1-7d, BRS>=500):");
  console.table([summary.battlerCandidates.priceGhst]);
  console.log("\nBattler band by BRS bucket:");
  console.table(summary.battlerCandidates.byBrsBucket);
  console.log("\nTop whitelists:");
  console.table(summary.topWhitelists.slice(0, 15));

  console.log(`\nWrote: ${path.join(OUT_DIR, "lending-last-30d.raw.json")}`);
  console.log(`Wrote: ${path.join(OUT_DIR, "lending-last-30d.summary.json")}`);
  console.log(`Wrote: ${path.join(OUT_DIR, "user-gotchis.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
