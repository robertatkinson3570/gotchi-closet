import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How do Aavegotchi set bonuses work?",
    a: "Equip every wearable in a named set and the set bonus applies automatically on top of the items' own effects: extra trait points plus extra rarity score. The bonus only counts while all required pieces are equipped at once, and when outfits qualify for multiple sets, the best applicable bonus applies.",
  },
  {
    q: "What is the cheapest wearable set to complete?",
    a: "It changes with wearable floor prices, so compute it live: a set's completion cost is the sum of the cheapest Baazaar listing for each required piece. Common-tier sets with few pieces are usually cheapest. GotchiCloset's set pages list every required wearable so you can price each one against live listings.",
  },
];

export default function WearableSetsGuide() {
  return (
    <GuideLayout
      slug="wearable-sets"
      seoTitle="Aavegotchi Wearable Sets: How Bonuses Work and Which Are Worth It"
      seoDescription="How Aavegotchi wearable set bonuses work: detection, bonus math on top of item modifiers, pricing a set from live floors, and matching sets to trait builds."
      h1="Aavegotchi Wearable Sets: How Bonuses Work and Which Sets Are Worth It"
      dek="The pillar guide to sets: detection rules, bonus math, and how to pick and price one for your build."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Wearable sets are named combinations of Aavegotchi wearables that
          grant an extra bonus when every piece is equipped at the same time.
          The set bonus adds trait points and rarity score (BRS) on top of the
          individual items' own modifiers, making complete sets the most
          efficient way to raise a gotchi's rarity.
        </>
      }
      faqs={faqs}
      related={["rarity-farming", "forge", "valuation", "gotchi-battler"]}
    >
      <GuideSection title="How does set detection work?">
        <p>
          Detection is automatic: the contracts recognize a set the moment
          all of its required wearables are equipped on one gotchi. There is
          no activation step and nothing to claim. Unequip any required piece
          and the bonus disappears with it. When an outfit satisfies more than
          one set at once, the best applicable bonus is the one that counts,
          so you never lose out by owning overlapping sets.
        </p>
      </GuideSection>

      <GuideSection title="How does the bonus math work?">
        <p>Rarity from an outfit stacks in three layers:</p>
        <ul className="list-disc pl-5">
          <li>
            Item BRS: each wearable adds flat rarity by tier: common +1,
            uncommon +2, rare +5, legendary +10, mythical +20, godlike +50.
          </li>
          <li>
            Item trait modifiers: each wearable shifts the four core traits,
            which changes trait-based BRS as traits move further from 50.
          </li>
          <li>
            Set bonus: completing the set adds its own trait points and BRS
            on top of both layers above.
          </li>
        </ul>
        <p>
          The full formula, with a worked example, is on the{" "}
          <Link className="underline" to="/rarity-score">
            rarity score page
          </Link>
          . Set data and definitions are also documented on the{" "}
          <a
            className="underline"
            href="https://wiki.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Aavegotchi wiki
          </a>
          .
        </p>
      </GuideSection>

      <GuideSection title="How do I price a set before completing it?">
        <p>
          A set's completion cost is simply the sum of the cheapest live
          listing for each required piece. As of July 2026 the practical
          workflow is: open the set's page in the{" "}
          <Link className="underline" to="/sets">
            sets index
          </Link>{" "}
          (all 150+ sets have one), note the required wearables, and price
          each on the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar
          </Link>
          . Floors move daily, so price at purchase time, not from a cached
          list. Two rules of thumb: sets with fewer pieces are cheaper to
          finish, and common-tier sets cost a fraction of mythical or godlike
          ones.
        </p>
      </GuideSection>

      <GuideSection title="Which sets fit which builds?">
        <p>
          Match the set's trait bonus direction to your gotchi's existing
          extremes. A gotchi with high NRG wants sets whose bonuses push NRG
          higher, not toward the middle; the same logic applies to low-trait
          builds in the negative direction. The{" "}
          <Link className="underline" to="/traits">
            trait guides
          </Link>{" "}
          list which sets boost each trait, and the{" "}
          <Link className="underline" to="/wardrobe-lab">
            Wardrobe Lab
          </Link>{" "}
          can search your options automatically, including a set-preservation
          mode that upgrades an outfit without breaking a completed set.
        </p>
        <p>
          Try any set on your own gotchi in the{" "}
          <Link className="underline" to="/dress">
            dressing room
          </Link>{" "}
          before buying a single piece.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
