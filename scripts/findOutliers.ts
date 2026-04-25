/**
 * Find above-median rentals for BRS bands below 660, and surface every paid
 * lending sorted by GHST/day to spot what borrowers actually paid up for.
 */
import fs from "fs";
import path from "path";

type Lending = {
  id: string;
  gotchiTokenId: string;
  gotchiBRS: string;
  period: string;
  upfrontCost: string;
  splitOwner: string;
  splitBorrower: string;
  splitOther: string;
  whitelistId: string | null;
  whitelist: { name: string | null } | null;
  channellingAllowed: boolean;
  completed: boolean;
  timeAgreed: string;
  gotchi: { name: string | null; modifiedRarityScore: string } | null;
};

const lendings: Lending[] = JSON.parse(
  fs.readFileSync(path.resolve("tmp/lending-last-30d.raw.json"), "utf-8")
);

const ghst = (w: string) => Number(BigInt(w || "0")) / 1e18;
const days = (s: string) => Number(s) / 86400;

const open = lendings.filter(
  (l) => (!l.whitelistId || l.whitelistId === "0") && ghst(l.upfrontCost) > 0
);

console.log(`\nOpen-market paid lendings: ${open.length}\n`);

// Top-paid by GHST/day across all BRS
const all = open
  .map((l) => ({
    id: l.gotchiTokenId,
    name: l.gotchi?.name ?? "?",
    brs: Number(l.gotchiBRS),
    days: Math.round(days(l.period) * 10) / 10,
    ghst: ghst(l.upfrontCost),
    ghstPerDay: ghst(l.upfrontCost) / days(l.period),
    splitB: Number(l.splitBorrower),
    chan: l.channellingAllowed,
    date: new Date(Number(l.timeAgreed) * 1000).toISOString().slice(0, 10),
  }))
  .sort((a, b) => b.ghstPerDay - a.ghstPerDay);

console.log("## Top 20 by GHST/day (open-market, paid)\n");
console.log("| Gotchi | BRS | Days | GHST | GHST/day | split-B | chan | Date |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of all.slice(0, 20)) {
  console.log(
    `| ${r.id} ${r.name} | ${r.brs} | ${r.days} | ${r.ghst} | ${r.ghstPerDay.toFixed(2)} | ${r.splitB}% | ${r.chan ? "✓" : "—"} | ${r.date} |`
  );
}

// Per-band outlier hunt: anything BRS<660 that rented above its band median
function band(brs: number) {
  if (brs >= 700) return "700+";
  if (brs >= 660) return "660-699";
  if (brs >= 630) return "630-659";
  if (brs >= 600) return "600-629";
  if (brs >= 570) return "570-599";
  if (brs >= 530) return "530-569";
  if (brs >= 500) return "500-529";
  return "<500";
}

const lowMidBands = ["530-569", "570-599", "600-629", "630-659", "660-699"];
console.log("\n## All paid open-market lendings in your gotchis' bands (sorted by price desc)\n");
console.log("| Band | Gotchi | BRS | Days | GHST | GHST/day | split-B | chan | Date |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const b of lowMidBands) {
  const inBand = all.filter((r) => band(r.brs) === b).sort((a, b2) => b2.ghst - a.ghst);
  for (const r of inBand) {
    console.log(
      `| ${b} | ${r.id} ${r.name} | ${r.brs} | ${r.days} | **${r.ghst}** | ${r.ghstPerDay.toFixed(2)} | ${r.splitB}% | ${r.chan ? "✓" : "—"} | ${r.date} |`
    );
  }
}

// Highest single payments overall
console.log("\n## Top 10 highest absolute GHST upfront payments\n");
const byTotal = [...all].sort((a, b) => b.ghst - a.ghst).slice(0, 10);
console.log("| Gotchi | BRS | Days | GHST | split-B | chan | Date |");
console.log("|---|---|---|---|---|---|---|");
for (const r of byTotal) {
  console.log(
    `| ${r.id} ${r.name} | ${r.brs} | ${r.days} | **${r.ghst}** | ${r.splitB}% | ${r.chan ? "✓" : "—"} | ${r.date} |`
  );
}
