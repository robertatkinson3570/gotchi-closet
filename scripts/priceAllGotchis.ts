/**
 * Print a table for every owned gotchi with: id, name, modBRS, band, suggested 7d rental price.
 * Adds per-band subtotals + grand total.
 * Reads tmp/user-gotchis.json (already fetched).
 */
import fs from "fs";
import path from "path";

const userGotchis: any[] = JSON.parse(
  fs.readFileSync(path.resolve("tmp/user-gotchis.json"), "utf-8")
);

function band(brs: number): { label: string; suggested7d: number; note: string } {
  if (brs >= 700) return { label: "700+ Godlike+", suggested7d: 200, note: "direct comp (n=8, median 200, p75 250)" };
  if (brs >= 660) return { label: "660-699 Godlike", suggested7d: 100, note: "data gap; bridge between 600-629 and 700+" };
  if (brs >= 630) return { label: "630-659 Godlike", suggested7d: 60, note: "data gap; bridge below 660-699" };
  if (brs >= 600) return { label: "600-629 Godlike", suggested7d: 40, note: "extrapolated from 2-3d median 20" };
  if (brs >= 570) return { label: "570-599 Godlike", suggested7d: 20, note: "extrapolated from 2-3d median 2.7" };
  if (brs >= 530) return { label: "530-569 Godlike", suggested7d: 10, note: "extrapolated from 2-3d median 2.4" };
  if (brs >= 500) return { label: "500-529 Mythical", suggested7d: 10, note: "direct comp (n=7, all 10)" };
  return { label: "<500", suggested7d: 5, note: "sparse data" };
}

const rows = userGotchis
  .map((g) => {
    const brs = Number(g.modifiedRarityScore);
    const b = band(brs);
    return {
      id: g.gotchiId,
      name: g.name,
      modBRS: brs,
      bandLabel: b.label,
      suggested7d: b.suggested7d,
    };
  })
  .sort((a, b) => b.modBRS - a.modBRS);

// running cumulative total
let cum = 0;
const rowsWithCum = rows.map((r) => {
  cum += r.suggested7d;
  return { ...r, runningTotal: cum };
});

console.log("\n# All Gotchis — Suggested 7-day rental price (with running total)\n");
console.log("| # | Name | mod BRS | Band | 7d (GHST) | Running total |");
console.log("|---|---|---|---|---|---|");
for (const r of rowsWithCum) {
  console.log(`| ${r.id} | ${r.name} | ${r.modBRS} | ${r.bandLabel} | ${r.suggested7d} | **${r.runningTotal}** |`);
}

// per-band subtotals
const bandMap = new Map<string, { count: number; price: number; subtotal: number }>();
for (const r of rows) {
  const e = bandMap.get(r.bandLabel) ?? { count: 0, price: r.suggested7d, subtotal: 0 };
  e.count += 1;
  e.subtotal += r.suggested7d;
  bandMap.set(r.bandLabel, e);
}

const bandOrder = [
  "700+ Godlike+",
  "660-699 Godlike",
  "630-659 Godlike",
  "600-629 Godlike",
  "570-599 Godlike",
  "530-569 Godlike",
  "500-529 Mythical",
  "<500",
];

console.log("\n## Subtotals by band\n");
console.log("| Band | Count | Price each | Subtotal |");
console.log("|---|---|---|---|");
let total = 0;
for (const label of bandOrder) {
  const e = bandMap.get(label);
  if (!e) continue;
  total += e.subtotal;
  console.log(`| ${label} | ${e.count} | ${e.price} | **${e.subtotal}** |`);
}
console.log(`| **TOTAL** | **${rows.length}** | — | **${total} GHST / week** |`);

fs.writeFileSync(
  path.resolve("tmp/gotchi-pricing-table.json"),
  JSON.stringify({ rows: rowsWithCum, bandSubtotals: Object.fromEntries(bandMap), grandTotal: total }, null, 2)
);
console.log("\nWrote: tmp/gotchi-pricing-table.json");
