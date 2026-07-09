import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "What do you get from smelting a wearable?",
    a: "Smelting destroys a wearable and returns 90% of the alloy that went into forging it. Of the 10% that is lost, half is burned forever, permanently shrinking alloy supply. You also get the wearable's core back, which can be reused to forge another wearable in the same slot and rarity tier.",
  },
  {
    q: "How do I get alloy in Aavegotchi?",
    a: "There are no new alloy emissions: supply comes from smelting existing wearables and from trading. In practice you either smelt wearables you own, or buy alloy directly from other players in the Baazaar's Forge category on Base. Because smelting burns part of the alloy, total supply only trends down.",
  },
  {
    q: "What is essence used for in the Forge?",
    a: "Essence is the scarcest Forge ingredient, required on top of a schematic, core, and alloy to forge the highest-tier wearables, such as godlike items. It comes from releasing (sacrificing) an Aavegotchi, which is why it is rare: each unit represents a gotchi that no longer exists.",
  },
];

export default function ForgeGuide() {
  return (
    <GuideLayout
      slug="forge"
      seoTitle="Aavegotchi Forge Guide: Crafting, Smelting, Alloy, and Essence"
      seoDescription="How the Aavegotchi Forge works on Base: forging wearables from schematics, cores, and alloy, the 90% smelting return, where alloy comes from, geodes, and essence."
      h1="The Aavegotchi Forge: Crafting, Smelting, Alloy, and Essence Explained"
      dek="The crafting system that controls wearable supply: recipes, the smelting math, and every material."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          The Forge is Aavegotchi's on-chain crafting system on Base. It lets
          you forge new wearables from a schematic, a core, and alloy, and
          smelt existing wearables back into materials. Smelting returns 90%
          of a wearable's alloy; half of the 10% loss is burned forever, so
          wearable supply is player-controlled and deflationary.
        </>
      }
      faqs={faqs}
      related={["wearable-sets", "baazaar", "rarity-farming", "valuation"]}
    >
      <GuideSection title="How does forging a wearable work?">
        <p>
          A forge recipe has three parts, plus one for the top tiers:
        </p>
        <ul className="list-disc pl-5">
          <li>
            Schematic: the blueprint for one specific wearable. Limited in
            number, tradeable on the Baazaar.
          </li>
          <li>
            Core: determines the slot (body, face, head, and so on) and
            rarity tier of the item being forged.
          </li>
          <li>
            Alloy: the bulk material cost. Higher rarity tiers consume more
            alloy.
          </li>
          <li>
            Essence: additionally required for the highest tiers, such as
            godlike wearables.
          </li>
        </ul>
        <p>
          Forging runs through a queue, and GLTR (the token earned from{" "}
          <Link className="underline" to="/staking">
            LP staking
          </Link>
          ) can be spent to speed it up. Full recipes are documented on the{" "}
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

      <GuideSection title="How does smelting work?">
        <p>
          Smelting is forging in reverse: you destroy a wearable and recover
          its materials. The math is the part worth memorizing: you get 90% of
          the wearable's alloy back, and of the 10% you lose, half is burned
          permanently. The core is returned and can be reused. This makes
          smelting the supply valve of the wearable economy: when a wearable's
          market price falls below its material value, smelting becomes
          profitable, wearable supply shrinks, and alloy supply shrinks a
          little with every cycle.
        </p>
      </GuideSection>

      <GuideSection title="Where does alloy come from now?">
        <p>
          Nowhere new: there are no ongoing alloy emissions. The circulating
          supply comes from what players already hold, what smelting releases,
          and what trades hands on the market. If you need alloy, your two
          options are smelting wearables you own or buying alloy in the Forge
          category of the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>
          , where alloy, essence, cores, geodes, and schematics all trade as
          on-chain items.
        </p>
      </GuideSection>

      <GuideSection title="What are geodes?">
        <p>
          Geodes are Forge loot containers: cracking one open gives a chance
          at a wearable schematic. Like other Forge materials they are
          tradeable, so you can buy, sell, or open them. Treat them as a
          lottery ticket priced by the market rather than a reliable schematic
          source.
        </p>
      </GuideSection>

      <GuideSection title="Where do I manage Forge assets?">
        <p>
          GotchiCloset's{" "}
          <Link className="underline" to="/forge">
            Forge page
          </Link>{" "}
          covers smelting and forging tooling, and the Baazaar's Forge tab
          lists live prices for every material. If you are deciding whether a
          wearable is worth more equipped or smelted, the{" "}
          <Link className="underline" to="/guides/valuation">
            valuation guide
          </Link>{" "}
          walks through that comparison.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
