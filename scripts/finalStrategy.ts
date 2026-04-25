/**
 * Hybrid plan: top 21 gotchis form 3 tournament teams (5 starters + 2 subs each),
 * remaining 37 gotchis listed for rent at a slight premium over the baseline median.
 */
import fs from "fs";
import path from "path";

type Row = { id: string; name: string; modBRS: number; bandLabel: string; suggested7d: number };
const data = JSON.parse(fs.readFileSync(path.resolve("tmp/gotchi-pricing-table.json"), "utf-8"));
const rows: Row[] = data.rows;

const top21 = rows.slice(0, 21);
const rest37 = rows.slice(21);

// Slight premium per band — informed by what filled vs what didn't.
// Goal: above the seen median, below the seen ceiling so it still fills.
function premiumPrice(brs: number): { price7d: number; rationale: string } {
  if (brs >= 600)
    return {
      price7d: 50,
      rationale: "20 above baseline; one repeat 2d/20 GHST renter exists. May sit; consider relisting as 2d/20 if 7d fails",
    };
  if (brs >= 570)
    return {
      price7d: 25,
      rationale: "5 above baseline; only 1 paid comp existed at 2.7/3d. Aspirational",
    };
  if (brs >= 530)
    return {
      price7d: 15,
      rationale: "5 above baseline; outlier was 80 (branded, 0% split) — unlikely to repeat",
    };
  return { price7d: 12, rationale: "2 above direct comp of 10" };
}

const teams = [
  { name: "Team A", starters: top21.slice(0, 5), subs: top21.slice(15, 17) },
  { name: "Team B", starters: top21.slice(5, 10), subs: top21.slice(17, 19) },
  { name: "Team C", starters: top21.slice(10, 15), subs: top21.slice(19, 21) },
];

console.log("\n# Hybrid Strategy: 3 Tournament Teams + 37 Rentals\n");

console.log("## Tournament rosters (top 21 by mod BRS)\n");
for (const t of teams) {
  console.log(`### ${t.name}`);
  console.log("| Role | # | Name | mod BRS |");
  console.log("|---|---|---|---|");
  for (const g of t.starters) console.log(`| Starter | ${g.id} | ${g.name} | ${g.modBRS} |`);
  for (const g of t.subs) console.log(`| Sub | ${g.id} | ${g.name} | ${g.modBRS} |`);
  console.log();
}

const expectedPrizes = [650, 380, 310]; // from your last tournament: a, b, c
const tournamentTotal = expectedPrizes.reduce((a, b) => a + b, 0);
console.log(`**Expected tournament total** (based on last cycle: ${expectedPrizes.join(" + ")}): **${tournamentTotal} GHST**`);

console.log("\n## Rental listings — bottom 37 at slight premium\n");
console.log("| # | Name | mod BRS | Band | Premium 7d (GHST) | Old base | Δ |");
console.log("|---|---|---|---|---|---|---|");
let rentTotal = 0;
const rentalRows = rest37.map((g) => {
  const p = premiumPrice(g.modBRS);
  rentTotal += p.price7d;
  return { ...g, premium: p.price7d };
});
for (const g of rentalRows) {
  console.log(`| ${g.id} | ${g.name} | ${g.modBRS} | ${g.bandLabel} | **${g.premium}** | ${g.suggested7d} | +${g.premium - g.suggested7d} |`);
}

console.log(`\n**Rental total upfront @ 100% fill**: ${rentTotal} GHST`);

// Subtotals
const bands: Record<string, { count: number; price: number; sub: number; rationale: string }> = {};
for (const g of rentalRows) {
  const b = bands[g.bandLabel] ??= { count: 0, price: g.premium, sub: 0, rationale: premiumPrice(g.modBRS).rationale };
  b.count += 1;
  b.sub += g.premium;
}

console.log("\n## Rental subtotals by band\n");
console.log("| Band | Count | Price | Subtotal | Rationale |");
console.log("|---|---|---|---|---|");
for (const [label, b] of Object.entries(bands)) {
  console.log(`| ${label} | ${b.count} | ${b.price} | **${b.sub}** | ${b.rationale} |`);
}
console.log(`| **TOTAL** | **${rest37.length}** | — | **${rentTotal}** | |`);

console.log("\n## Combined weekly outlook\n");
console.log("| Component | GHST |");
console.log("|---|---|");
console.log(`| Tournament (3 teams) | ${tournamentTotal} |`);
console.log(`| Rental upfront @ 100% fill | ${rentTotal} |`);
console.log(`| Rental upfront @ 50% fill | ${Math.round(rentTotal * 0.5)} |`);
console.log(`| Rental upfront @ 25% fill (realistic for sub-600 BRS) | ${Math.round(rentTotal * 0.25)} |`);
console.log(`| **Best case total** | **${tournamentTotal + rentTotal}** |`);
console.log(`| **50% fill total** | **${tournamentTotal + Math.round(rentTotal * 0.5)}** |`);
console.log(`| **25% fill total** | **${tournamentTotal + Math.round(rentTotal * 0.25)}** |`);

fs.writeFileSync(
  path.resolve("tmp/hybrid-strategy.json"),
  JSON.stringify(
    {
      teams: teams.map((t) => ({
        name: t.name,
        starters: t.starters.map((g) => ({ id: g.id, name: g.name, modBRS: g.modBRS })),
        subs: t.subs.map((g) => ({ id: g.id, name: g.name, modBRS: g.modBRS })),
      })),
      rentals: rentalRows.map((g) => ({ id: g.id, name: g.name, modBRS: g.modBRS, band: g.bandLabel, premium7d: g.premium })),
      expectedTournament: tournamentTotal,
      expectedRentalUpfront100: rentTotal,
    },
    null,
    2
  )
);
console.log("\nWrote: tmp/hybrid-strategy.json");
