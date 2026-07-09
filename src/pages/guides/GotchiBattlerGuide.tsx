import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "Which traits matter in Gotchi Battler?",
    a: "The four core traits: energy (NRG), aggression (AGG), spookiness (SPK), and brain size (BRN). What matters is how extreme each value is: a trait near 0 or near 100 is far stronger than one near the average of 50, in either direction. Balanced, middle-of-the-road gotchis make weak battlers.",
  },
  {
    q: "Can I change my gotchi's battle stats?",
    a: "Yes, two ways. Wearables shift the four core traits while equipped, so an outfit can push a trait further toward its extreme. Skill points, earned as your gotchi levels up from XP, permanently adjust traits and can be respecced later. Eye shape and eye color cannot be changed.",
  },
];

export default function GotchiBattlerGuide() {
  return (
    <GuideLayout
      slug="gotchi-battler"
      seoTitle="Gotchi Battler Guide: How Traits and Wearables Decide Fights"
      seoDescription="How Gotchi Battler works: why trait extremes win, building a battler with wearables and the Wardrobe Lab battler mode, and where to follow tournaments."
      h1="Gotchi Battler: How Traits and Wearables Decide Fights"
      dek="Why extreme traits win, and how to build toward them with wearables and skill points."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Gotchi Battler is a community-built battle game for Aavegotchi in
          which teams of gotchis fight automated battles. Performance comes
          from the four core traits (NRG, AGG, SPK, BRN), and extremes win:
          the further a trait sits from the average of 50, in either
          direction, the stronger it is in battle.
        </>
      }
      faqs={faqs}
      related={["wearable-sets", "rarity-farming", "what-is-aavegotchi", "valuation"]}
    >
      <GuideSection title="How do traits decide fights?">
        <p>
          Aavegotchi's traits sit on a bell curve where both ends are rare:
          a 2 NRG gotchi is just as exceptional as a 97 NRG one. Gotchi
          Battler leans into that same principle: battle strength derives
          from the four core trait values, and distance from 50 is what
          counts. This mirrors rarity scoring, so a gotchi bred (or dressed)
          for extreme traits tends to be strong in both{" "}
          <Link className="underline" to="/rarity-score">
            BRS
          </Link>{" "}
          and battle. Note that eye shape and eye color are fixed at summon
          and cannot be shifted by wearables.
        </p>
      </GuideSection>

      <GuideSection title="How do you build a battler with wearables?">
        <p>
          Wearables shift the four core traits while equipped, so the battler
          playbook is: find your gotchi's most extreme traits and push them
          further. The{" "}
          <Link className="underline" to="/wardrobe-lab">
            Wardrobe Lab
          </Link>{" "}
          has a dedicated battler mode that does this automatically: it
          identifies your gotchi's dominant high trait and dominant low trait,
          then searches for wearables (and full{" "}
          <Link className="underline" to="/sets">
            sets
          </Link>
          ) that amplify both. Browse per-trait wearable lists in the{" "}
          <Link className="underline" to="/traits">
            trait guides
          </Link>{" "}
          if you prefer to build by hand.
        </p>
        <p>
          Skill points are the permanent lever: leveling up from XP grants
          points you can spend to move traits, and a respec resets them if
          your build plan changes.
        </p>
      </GuideSection>

      <GuideSection title="Where do you play, and when are tournaments?">
        <p>
          The game itself lives at{" "}
          <a
            className="underline"
            href="https://gotchibattler.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            gotchibattler.com
          </a>
          , which runs tournaments with its own schedule and prize structure;
          check there for current dates rather than trusting cached answers,
          since formats change between seasons.
        </p>
      </GuideSection>

      <GuideSection title="How do share pages work?">
        <p>
          Every gotchi has a public page on GotchiCloset at /g/ followed by
          its token id, showing its traits, wearables, and battle-relevant
          stats without needing a wallet. Share it to show off a build or
          scout an opponent's gotchi before a fight.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
