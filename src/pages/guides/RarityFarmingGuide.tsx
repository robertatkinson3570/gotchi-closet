import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How does rarity farming pay out?",
    a: "Each season, snapshots rank every gotchi on three leaderboards: rarity (BRS including wearables and sets), kinship, and XP. Gotchis placing above the payout cutoff earn GHST proportional to rank, paid into the gotchi's escrow wallet. Recent seasons split the pool 70% rarity, 20% kinship, 10% XP.",
  },
  {
    q: "Is rarity farming worth it in 2026?",
    a: "It depends on your entry cost and target leaderboard. Chasing the rarity board means buying wearables, which is capital you can usually resell. The kinship board only costs consistency: petting every 12 hours is free. Work out your gotchi's likely rank before spending, not after.",
  },
  {
    q: "Can borrowed gotchis earn rarity farming rewards?",
    a: "Rewards are paid to the gotchi itself, into its escrow wallet, regardless of who is borrowing it. How that GHST is shared depends on the lending agreement: the on-chain revenue split between owner, borrower, and any third address decides who receives what when tokens are distributed.",
  },
];

export default function RarityFarmingGuide() {
  return (
    <GuideLayout
      slug="rarity-farming"
      seoTitle="Aavegotchi Rarity Farming in 2026: Rewards, Strategy, Worth It?"
      seoDescription="How Aavegotchi rarity farming works in 2026: the three leaderboards, the 70/20/10 GHST pool split, strategy per budget, and an honest look at whether it pays."
      h1="Aavegotchi Rarity Farming in 2026: Rewards, Strategy, and Whether It's Worth It"
      dek="The GHST reward seasons explained: leaderboards, pool splits, and honest math on competing."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Rarity farming is Aavegotchi's seasonal reward program: gotchis
          compete on three leaderboards (rarity, kinship, and XP) and the top
          ranks in each earn GHST from a shared prize pool. In recent seasons
          the pool has been split 70% to rarity, 20% to kinship, and 10% to
          XP, all paid on Base.
        </>
      }
      faqs={faqs}
      related={["kinship", "wearable-sets", "gotchi-lending", "valuation"]}
    >
      <GuideSection title="How do the three leaderboards work?">
        <ul className="list-disc pl-5">
          <li>
            Rarity: ranks gotchis by rarity score including equipped wearables
            and set bonuses, so wearables are the main lever. See the{" "}
            <Link className="underline" to="/rarity-score">
              rarity score guide
            </Link>{" "}
            for the exact math.
          </li>
          <li>
            Kinship: ranks by kinship, which grows one point per pet every 12
            hours. Pure consistency; no spending required.
          </li>
          <li>
            XP: ranks by experience points, earned from DAO participation,
            events, and XP potions.
          </li>
        </ul>
        <p>
          Seasons are announced by Pixelcraft and the DAO, and historically
          each season paid out across four snapshot rounds, so mid-season
          improvements still count toward later rounds. The{" "}
          <a
            className="underline"
            href="https://wiki.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Aavegotchi wiki
          </a>{" "}
          keeps the per-season record.
        </p>
      </GuideSection>

      <GuideSection title="What strategy fits your budget?">
        <ul className="list-disc pl-5">
          <li>
            Zero budget: run the kinship ladder. Pet every 12 hours without
            missing, and check your position on the{" "}
            <Link className="underline" to="/leaderboard">
              kinship and XP leaderboard
            </Link>
            . The 20% kinship pool rewards nothing but discipline.
          </li>
          <li>
            Modest budget: raise BRS efficiently. Use the{" "}
            <Link className="underline" to="/wardrobe-lab">
              Wardrobe Lab optimizer
            </Link>{" "}
            to find the cheapest wearables that push your traits further from
            50, and prefer full{" "}
            <Link className="underline" to="/guides/wearable-sets">
              wearable sets
            </Link>{" "}
            since set bonuses stack on top of item modifiers.
          </li>
          <li>
            Serious budget: high-tier wearables. Mythical (+20 BRS) and
            godlike (+50 BRS) items dominate the top of the rarity board, and
            they hold resale value, so treat them as repositionable capital
            rather than a sunk cost.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Is rarity farming worth it?">
        <p>
          Do the math honestly, in this order. First, estimate where your
          gotchi ranks today: compare its BRS against the field on the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>
          . Second, price the upgrade: what would the wearables cost to move
          up meaningfully? Third, remember the costs that are not GHST:
          petting twice a day for a whole season is a real commitment, and
          missed pets decay kinship.
        </p>
        <p>
          The honest summary: kinship farming is worth it for almost anyone
          because it is free. Rarity-board farming is worth it when you either
          already own strong wearables or are comfortable holding them as
          assets. Buying purely to chase one season's payout is the weakest
          position, because you are betting a known cost against an uncertain
          rank.
        </p>
      </GuideSection>

      <GuideSection title="Season log">
        <p>
          This page is updated as seasons are announced. As of July 2026 the
          figures above reflect the most recent DAO-approved format: a 70/20/10
          split across rarity, kinship, and XP. Check the{" "}
          <Link className="underline" to="/dao">
            DAO dashboard
          </Link>{" "}
          for live proposals that change rarity farming parameters.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
