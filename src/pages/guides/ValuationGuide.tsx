import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How do I find out what my Aavegotchi is worth?",
    a: "Comp it: find recent sales of gotchis with similar BRS, traits, kinship, and wearables on the Baazaar and its activity feed, then adjust for differences. Add the floor value of its equipped wearables, since those can be unequipped and sold separately. The result is a realistic range, not a single number.",
  },
  {
    q: "Do wearables or BRS matter more for price?",
    a: "Wearables usually dominate, because they are liquid: a godlike wearable can be unequipped and sold at floor tomorrow, while naked BRS is locked into the gotchi. Buyers price naked BRS, kinship, and XP as the gotchi's own value, then add the wearables roughly at their floor prices.",
  },
];

export default function ValuationGuide() {
  return (
    <GuideLayout
      slug="valuation"
      seoTitle="How Much Is Your Aavegotchi Worth? A Practical Valuation Guide"
      seoDescription="Value an Aavegotchi from comparable sales and parts: BRS percentile, wearable floors, kinship and XP premiums, and when parts are worth more than the whole."
      h1="How Much Is Your Aavegotchi Worth? A Practical Valuation Guide"
      dek="No oracle exists: value comes from comparable sales plus the liquidation value of the parts."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          There is no oracle price for an Aavegotchi: a gotchi is worth what
          comparable gotchis actually sell for, plus the liquidation value of
          its parts. A practical valuation uses four inputs: BRS percentile,
          equipped wearables at floor price, kinship and XP premiums, and
          collectible premiums such as a low token id.
        </>
      }
      faqs={faqs}
      related={["baazaar", "wearable-sets", "kinship", "rarity-farming"]}
    >
      <GuideSection title="What drives a gotchi's price?">
        <ul className="list-disc pl-5">
          <li>
            BRS percentile: not the raw number but where it ranks against the
            field, since rarity farming pays by rank. Compute yours on the{" "}
            <Link className="underline" to="/rarity-score">
              rarity score page
            </Link>
            .
          </li>
          <li>
            Wearables at floor: each equipped wearable is separately sellable,
            so sum the current floor of every piece via the{" "}
            <Link className="underline" to="/wearables">
              wearables database
            </Link>{" "}
            and live Baazaar listings.
          </li>
          <li>
            Kinship and XP: both take real time to build and cannot be bought
            outright (kinship grows one pet per 12 hours), so high scores
            carry a premium. See the{" "}
            <Link className="underline" to="/guides/kinship">
              kinship guide
            </Link>
            .
          </li>
          <li>
            Collectible premiums: low token ids, haunt 1 origin, and good
            names attract collectors beyond any stat-based value.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="How do I find comparable sales?">
        <p>
          Open the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>
          , filter gotchis to a band around your gotchi's BRS and traits, and
          note both asking prices and, more importantly, actual sales in the{" "}
          <Link className="underline" to="/activity">
            activity feed
          </Link>
          . Listings tell you what sellers hope for; sales tell you what
          buyers pay. A gotchi's detail view on GotchiCloset also shows its
          own lifetime sale history, which anchors what the specific gotchi
          has traded at before. Marketplace mechanics are documented on the{" "}
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

      <GuideSection title="Is the whole worth more than the parts?">
        <p>
          Sometimes not, and you should check. Compare two numbers: the
          comp-based price of the dressed gotchi, and the naked-gotchi comp
          plus every wearable sold separately at floor. When the parts exceed
          the whole, the market is telling you the outfit is worth unbundling
          before sale. High-tier wearables are the usual cause: their floors
          are deep and liquid, while a dressed gotchi needs a buyer who wants
          exactly that combination.
        </p>
        <p>
          If you own many gotchis, the owned view on GotchiCloset shows a
          portfolio-wide floor value (gotchis plus wearables priced from
          current Baazaar floors) as a fast first estimate.
        </p>
      </GuideSection>

      <GuideSection title="What premiums do collectors pay?">
        <p>
          Qualitative but real: haunt 1 gotchis, very low token ids, and
          well-known names sell above stat-equivalent gotchis. Kinship and XP
          premiums scale with how far the score is from what a buyer could
          rebuild in a reasonable time. None of these have a formula; comps
          are the only honest measure, which is why the sales feed matters
          more than any calculator.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
