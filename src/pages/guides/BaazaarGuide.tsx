import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "What fees does the Baazaar charge?",
    a: "The Baazaar takes a 3.5% fee on each sale, so sellers receive 96.5% of the price. Per the Aavegotchi wiki, the fee splits into 2% to Pixelcraft Studios, 1% to the AavegotchiDAO treasury, and 0.5% to the rarity farming rewards pool. Fee levels can change by DAO vote.",
  },
  {
    q: "Can I list wearables and gotchis from GotchiCloset?",
    a: "Yes. GotchiCloset writes to the same Aavegotchi Baazaar contracts on Base as the official app: you can list gotchis and wearables for sale (including bulk-listing many at once), make and accept offers, and even create GBM auctions. Listed assets stay in your wallet until they sell.",
  },
];

export default function BaazaarGuide() {
  return (
    <GuideLayout
      slug="baazaar"
      seoTitle="Aavegotchi Baazaar Guide: Buy and Sell on Base"
      seoDescription="How the Aavegotchi Baazaar works on Base: categories, the 3.5% fee split, listing and offers, finding deals, and GBM bid-to-earn auctions."
      h1="The Aavegotchi Baazaar on Base: How to Buy and Sell Gotchis, Wearables, and Parcels"
      dek="The native marketplace explained: every category, the fee math, and how listings, offers, and auctions work."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          The Baazaar is Aavegotchi's native marketplace, running on Base
          since July 2025. It is where players buy and sell gotchis, portals,
          wearables, land parcels, Forge materials, and FAKE Gotchis, with
          every trade priced and settled in GHST directly between wallets
          through the Aavegotchi contracts.
        </>
      }
      faqs={faqs}
      related={["ghst", "valuation", "wearable-sets", "base-migration"]}
    >
      <GuideSection title="What can you buy on the Baazaar?">
        <p>
          Every major asset class in the ecosystem trades there. The{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>{" "}
          organizes them into tabs:
        </p>
        <ul className="list-disc pl-5">
          <li>Gotchis and closed portals</li>
          <li>
            Wearables (see the{" "}
            <Link className="underline" to="/wearables">
              wearables database
            </Link>{" "}
            for stats before you buy)
          </li>
          <li>Consumable items such as XP and kinship potions</li>
          <li>REALM parcels, installations, and tiles</li>
          <li>Forge materials: alloy, essence, cores, geodes, schematics</li>
          <li>FAKE Gotchis and FAKE Cards (community art NFTs)</li>
          <li>Gotchi Guardians skins</li>
          <li>Live GBM auctions</li>
        </ul>
      </GuideSection>

      <GuideSection title="What fees does the Baazaar charge?">
        <p>
          A 3.5% fee comes out of each sale, so the seller keeps 96.5%. As
          documented on the{" "}
          <a
            className="underline"
            href="https://wiki.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Aavegotchi wiki
          </a>
          , the split is 2% to Pixelcraft Studios, 1% to the AavegotchiDAO
          treasury, and 0.5% to the rarity farming rewards pool. Because the
          split was set by governance (the 0.5% rarity farming share was added
          by proposal AGIP6), the DAO can change it, so check the current rate
          before large sales.
        </p>
      </GuideSection>

      <GuideSection title="How do I list something for sale?">
        <p>
          Connect your wallet, open your owned assets, and list with a price
          in GHST. The asset stays in your wallet until someone buys it, so
          listing is not custody. From GotchiCloset you can also bulk-list
          many gotchis in one flow, and lending-listed or rented gotchis are
          handled separately through the{" "}
          <Link className="underline" to="/lending">
            lending page
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection title="How do offers (buy orders) work?">
        <p>
          On gotchis, wearables, and items you can place an offer below the
          asking price: your GHST is escrowed by the Aavegotchi contracts and
          refunded if you cancel or the offer expires. The owner can accept at
          any time. Offers are the patient buyer's tool: set a price, pick an
          expiry, and wait.
        </p>
      </GuideSection>

      <GuideSection title="How do I find good deals?">
        <ul className="list-disc pl-5">
          <li>
            Sort by recently listed and check often: mispriced listings go
            fast.
          </li>
          <li>
            Filter hard: price, rarity, traits, and sets narrow hundreds of
            listings to the few that fit your build.
          </li>
          <li>
            Comp before you buy: the{" "}
            <Link className="underline" to="/guides/valuation">
              valuation guide
            </Link>{" "}
            shows how to price a gotchi from comparable sales and parts.
          </li>
          <li>
            Watch the{" "}
            <Link className="underline" to="/activity">
              activity feed
            </Link>{" "}
            to learn what things actually sell for, not just what they list
            for.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="What are GBM auctions?">
        <p>
          GBM is a bid-to-earn auction format: when someone outbids you, you
          get your GHST back plus an incentive payment for having bid. Live
          auctions for gotchis, parcels, and items run in the Auctions tab,
          and you can create a GBM auction for your own assets directly from
          GotchiCloset. Watchlists alert you when you are outbid or an auction
          you follow is ending.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
