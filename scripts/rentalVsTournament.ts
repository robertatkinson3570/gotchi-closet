/**
 * Compare tournament earnings vs. renting the same gotchis.
 *
 * Teams formed by BRS rank: top 5 = team a, next 5 = team b, etc.
 * Compares per-team prize against rental upfront for the same gotchis.
 */
import fs from "fs";
import path from "path";

type Row = { id: string; name: string; modBRS: number; bandLabel: string; suggested7d: number };
const data = JSON.parse(fs.readFileSync(path.resolve("tmp/gotchi-pricing-table.json"), "utf-8"));
const rows: Row[] = data.rows.map((r: any) => ({
  id: r.id,
  name: r.name,
  modBRS: r.modBRS,
  bandLabel: r.bandLabel,
  suggested7d: r.suggested7d,
}));

const teams = [
  { letter: "a", rank: "?", wins: 6, prize: 650 },
  { letter: "b", rank: "33", wins: 5, prize: 380 },
  { letter: "c", rank: "49", wins: 5, prize: 310 },
  { letter: "f", rank: "65", wins: 5, prize: 250 },
  { letter: "h", rank: "97", wins: 4, prize: 200 },
  { letter: "d", rank: "129", wins: 4, prize: 150 },
  { letter: "e", rank: "129", wins: 3, prize: 150 },
  { letter: "g", rank: "129", wins: 3, prize: 150 },
  { letter: "i", rank: "257", wins: 2, prize: 80 },
  { letter: "j", rank: "257", wins: 3, prize: 80 },
  { letter: "k", rank: "257", wins: 3, prize: 80 },
  { letter: "l", rank: "513", wins: 1, prize: 0 },
];

const REV_SPLIT_LENDER = 0.20; // typical from data: borrower 80% / lender 20%

// Slice rows into 5-gotchi teams (top BRS first). Last team may be short.
const teamRows: Row[][] = [];
for (let i = 0; i < teams.length; i++) {
  teamRows.push(rows.slice(i * 5, i * 5 + 5));
}

console.log("\n# Per-team: Tournament prize vs. rental income\n");
console.log("| Team | Rank | Prize | Gotchis (BRS) | Rental upfront | Rev-split (20%) | Rent total | Δ vs tournament |");
console.log("|---|---|---|---|---|---|---|---|");

let totalPrize = 0;
let totalRentUpfront = 0;
let totalRentSplit = 0;

for (let i = 0; i < teams.length; i++) {
  const t = teams[i];
  const gs = teamRows[i];
  const upfront = gs.reduce((a, g) => a + g.suggested7d, 0);
  const split = Math.round(t.prize * REV_SPLIT_LENDER);
  const rentTotal = upfront + split;
  const delta = rentTotal - t.prize;
  const gList = gs.map((g) => `${g.id}(${g.modBRS})`).join(", ");
  console.log(`| ${t.letter} | ${t.rank} | ${t.prize} | ${gList} | ${upfront} | ${split} | **${rentTotal}** | ${delta >= 0 ? "+" : ""}${delta} |`);
  totalPrize += t.prize;
  totalRentUpfront += upfront;
  totalRentSplit += split;
}

const totalRent = totalRentUpfront + totalRentSplit;
console.log(`| **TOTAL** | — | **${totalPrize}** | 58 gotchis | **${totalRentUpfront}** | **${totalRentSplit}** | **${totalRent}** | **${totalRent - totalPrize >= 0 ? "+" : ""}${totalRent - totalPrize}** |`);

console.log("\n## Mixed strategy: rent top tier, play tournament with the rest\n");
const topCount = 7; // gotchis 1-7 (700+ and 660-699 bands)
const topRows = rows.slice(0, topCount);
const lostTeams = teams.slice(0, Math.ceil(topCount / 5)); // teams formed from these
const lostPrize = lostTeams.reduce((a, t) => a + t.prize, 0);
const topUpfront = topRows.reduce((a, g) => a + g.suggested7d, 0);
const topSplit = Math.round(lostPrize * REV_SPLIT_LENDER);
const remainingPrize = totalPrize - lostPrize;
const mixedTotal = topUpfront + topSplit + remainingPrize;

console.log(`- Rent top ${topCount} gotchis (BRS 660+): ${topUpfront} GHST upfront`);
console.log(`- Lose teams ${lostTeams.map((t) => t.letter).join(", ")} from tournament play (would have won ${lostPrize} GHST)`);
console.log(`- Rev split 20% on those rented teams' equivalent earnings: ${topSplit} GHST`);
console.log(`- Remaining tournament earnings (teams ${teams.slice(lostTeams.length).map((t) => t.letter).join(", ")}): ${remainingPrize} GHST`);
console.log(`- **Mixed total: ${mixedTotal} GHST**`);

console.log("\n## Summary\n");
console.log("| Strategy | Total GHST | Δ vs all-tournament |");
console.log("|---|---|---|");
console.log(`| All-tournament (current) | ${totalPrize} | — |`);
console.log(`| Rent everything @ 100% fill | ${totalRent} | ${totalRent - totalPrize >= 0 ? "+" : ""}${totalRent - totalPrize} |`);
console.log(`| Rent everything @ 50% fill | ${Math.round(totalRent * 0.5)} | ${Math.round(totalRent * 0.5) - totalPrize >= 0 ? "+" : ""}${Math.round(totalRent * 0.5) - totalPrize} |`);
console.log(`| Mixed: rent top ${topCount}, play rest | ${mixedTotal} | ${mixedTotal - totalPrize >= 0 ? "+" : ""}${mixedTotal - totalPrize} |`);
