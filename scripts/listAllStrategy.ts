/**
 * "List everything at premium, play whatever doesn't rent" strategy.
 *
 * Workflow:
 *   T-48h before tournament: list all 58 at premium 7d prices
 *   T-2h: see what rented; form tournament teams from remaining gotchis (best BRS first)
 *   T-0:  submit teams, play tournament
 */
import fs from "fs";
import path from "path";

type Row = { id: string; name: string; modBRS: number; bandLabel: string; suggested7d: number };
const data = JSON.parse(fs.readFileSync(path.resolve("tmp/gotchi-pricing-table.json"), "utf-8"));
const rows: Row[] = data.rows;

// Premium prices for "list-all" strategy: high enough to be worth your time if filled,
// not so high they'll never fill.
function premium(brs: number): number {
  if (brs >= 700) return 250;
  if (brs >= 660) return 150;
  if (brs >= 630) return 80;
  if (brs >= 600) return 50;
  if (brs >= 570) return 30;
  if (brs >= 530) return 15;
  return 15;
}

// Realistic fill-rate estimate per band, based on 30d open-market activity.
function fillRate(brs: number): number {
  if (brs >= 700) return 1.0;   // 8 comps in 30d, your 2 likely fill
  if (brs >= 660) return 0.20;  // zero comps, total guess
  if (brs >= 630) return 0.20;  // zero comps
  if (brs >= 600) return 0.15;  // ~1 active borrower, you have 16
  if (brs >= 570) return 0.08;  // ~1 active borrower, you have 17
  if (brs >= 530) return 0.20;  // ~5-7 rentals/mo across band
  return 0.50;                  // 500-529 had 7 fills/mo at fixed 10 GHST
}

const teamPrizes = [650, 380, 310, 250, 200, 150, 150, 150, 80, 80, 80, 0];

const rowsWithPlan = rows.map((g) => {
  const price = premium(g.modBRS);
  const f = fillRate(g.modBRS);
  return { ...g, premium: price, fillRate: f };
});

console.log("\n# List-all strategy: rent at premium, play the leftovers\n");

console.log("## Premium price by band\n");
const bandSummary: Record<string, { count: number; price: number; fill: number; expectedRented: number; expectedRevenue: number }> = {};
for (const g of rowsWithPlan) {
  const b = bandSummary[g.bandLabel] ??= { count: 0, price: g.premium, fill: g.fillRate, expectedRented: 0, expectedRevenue: 0 };
  b.count += 1;
  b.expectedRented += g.fillRate;
  b.expectedRevenue += g.fillRate * g.premium;
}
console.log("| Band | n | Premium 7d | Fill rate est. | Expected rented | Expected upfront GHST |");
console.log("|---|---|---|---|---|---|");
for (const [label, b] of Object.entries(bandSummary)) {
  console.log(`| ${label} | ${b.count} | ${b.price} | ${(b.fill * 100).toFixed(0)}% | ${b.expectedRented.toFixed(1)} | ${b.expectedRevenue.toFixed(0)} |`);
}

const totalExpectedRented = rowsWithPlan.reduce((a, g) => a + g.fillRate, 0);
const totalUpfront = rowsWithPlan.reduce((a, g) => a + g.fillRate * g.premium, 0);
const totalUpfront100 = rowsWithPlan.reduce((a, g) => a + g.premium, 0);

console.log(`\n**Expected rentals: ${totalExpectedRented.toFixed(1)} of 58**`);
console.log(`**Expected upfront GHST: ${totalUpfront.toFixed(0)}**`);
console.log(`**Max upfront if all rent: ${totalUpfront100} GHST**`);

// What happens to the leftovers? They play in tournaments. Top 21 BRS form 3 teams.
// If top BRS gotchis rent, lower ones move up to fill teams.
// Tournament prize ≈ proportional to top 21 BRS staying available.

console.log("\n## Scenario modeling\n");

// Each top-21 gotchi has a "tournament value" — its share of the 3-team prize pool.
// Top 21 contributes 1340 GHST across 21 slots ≈ 64 GHST/gotchi. But team a (top 5) is worth more.
// Approximate per-gotchi tournament value by team:
//   ranks 1-5 (team a): 650/5 = 130 each
//   ranks 6-10 (team b): 380/5 = 76 each
//   ranks 11-15 (team c): 310/5 = 62 each
//   ranks 16-21 (subs):  ~30 each (sub value, partially recoverable by promoting)
// If a top-21 gotchi rents, you backfill from rank 22+ at ~70% effectiveness.
function tournamentValue(rank0: number): number {
  if (rank0 < 5) return 130;
  if (rank0 < 10) return 76;
  if (rank0 < 15) return 62;
  if (rank0 < 21) return 30;
  return 0;
}

function scenario(label: string, fillMul: number) {
  const rentedFlags = rowsWithPlan.map((g) => Math.min(1, g.fillRate * fillMul));
  let upfront = 0;
  let lostTournamentValue = 0;
  for (let i = 0; i < rowsWithPlan.length; i++) {
    upfront += rentedFlags[i] * rowsWithPlan[i].premium;
    // when a top-21 gotchi rents, lose ~30% of its tournament slot value (70% recovered via backfill)
    lostTournamentValue += rentedFlags[i] * tournamentValue(i) * 0.30;
  }
  const tournamentPrize = 1340 - lostTournamentValue;
  const revSplit = upfront * 0.20 * 0.5; // ~20% lender split, assume borrower earns ~50% of upfront equivalent
  const total = upfront + revSplit + tournamentPrize;
  const expectedRentals = rentedFlags.reduce((a, b) => a + b, 0);
  console.log(`### ${label} (fillRate × ${fillMul})`);
  console.log(`- Expected rentals: ${expectedRentals.toFixed(1)}`);
  console.log(`- Rental upfront: ${upfront.toFixed(0)} GHST`);
  console.log(`- Rev-split: ${revSplit.toFixed(0)} GHST`);
  console.log(`- Tournament prize after backfill: ${tournamentPrize.toFixed(0)} GHST (lost ${lostTournamentValue.toFixed(0)} from rented top-21)`);
  console.log(`- **Total: ${total.toFixed(0)} GHST**\n`);
  return total;
}

const baseline = scenario("Baseline (data-driven fill rates)", 1.0);
const optimistic = scenario("Optimistic (2× expected fill)", 2.0);
const pessimistic = scenario("Pessimistic (0.5× expected fill)", 0.5);
const allRent = scenario("All rent (100% fill)", 999);

console.log("## Comparison vs. your baseline of \"play 3 teams only\"\n");
console.log("| Strategy | Total GHST | Δ vs 3-team only |");
console.log("|---|---|---|");
console.log(`| 3-team tournament only (no rentals) | 1,340 | — |`);
console.log(`| List-all PESSIMISTIC | ${pessimistic.toFixed(0)} | +${(pessimistic - 1340).toFixed(0)} |`);
console.log(`| **List-all BASELINE** | **${baseline.toFixed(0)}** | **+${(baseline - 1340).toFixed(0)}** |`);
console.log(`| List-all OPTIMISTIC | ${optimistic.toFixed(0)} | +${(optimistic - 1340).toFixed(0)} |`);
console.log(`| List-all 100% fill | ${allRent.toFixed(0)} | +${(allRent - 1340).toFixed(0)} |`);

console.log("\n## Final per-gotchi list price\n");
console.log("| # | Name | mod BRS | Band | List 7d (GHST) | Fill rate |");
console.log("|---|---|---|---|---|---|");
for (const g of rowsWithPlan) {
  console.log(`| ${g.id} | ${g.name} | ${g.modBRS} | ${g.bandLabel} | **${g.premium}** | ${(g.fillRate * 100).toFixed(0)}% |`);
}

fs.writeFileSync(
  path.resolve("tmp/list-all-strategy.json"),
  JSON.stringify({ rows: rowsWithPlan, expectedTotalUpfront: totalUpfront, maxUpfront: totalUpfront100 }, null, 2)
);
console.log("\nWrote: tmp/list-all-strategy.json");
