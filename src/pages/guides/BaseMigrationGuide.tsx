import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "Is Aavegotchi on Base or Polygon?",
    a: "Aavegotchi runs entirely on Base since July 25, 2025. Every gotchi, wearable, and parcel was mirrored from Polygon to Base automatically by snapshot, so owners did not need to bridge anything. The GHST token, Baazaar marketplace, and Gotchi lending all operate on Base today.",
  },
  {
    q: "Do I need to migrate my gotchi myself?",
    a: "No. The migration was done for you. Pixelcraft snapshotted ownership on Polygon and re-issued every gotchi, wearable, and parcel on Base to the same wallet address. If you held assets on Polygon before July 25, 2025, the same assets are already waiting in your wallet on Base.",
  },
  {
    q: "Where did my wearables go after the migration?",
    a: "Your wearables are on Base, in the same wallet address that held them on Polygon. Connect that wallet to a Base-aware app such as GotchiCloset and they appear immediately. If a wearable was equipped on a gotchi at snapshot time, it migrated equipped on that same gotchi.",
  },
  {
    q: "Can I still trade Aavegotchi assets on Polygon?",
    a: "No. The Polygon deployment is archival: the canonical collections, the Baazaar, and Gotchi lending all live on Base now. Anything still shown on Polygon marketplaces is a leftover mirror without the live game attached, so treat Polygon-era listings, guides, and contract addresses as historical.",
  },
];

export default function BaseMigrationGuide() {
  return (
    <GuideLayout
      slug="base-migration"
      seoTitle="Aavegotchi Base Migration: What Moved and Where Your Assets Went"
      seoDescription="Aavegotchi migrated from Polygon to Base on July 25, 2025. What moved, what changed, wallet setup, GHST on Base, and what old guides get wrong."
      h1="Aavegotchi on Base: What Moved, What Changed, and Where Your Stuff Went"
      dek="The July 2025 migration answered in plain terms: your assets moved automatically, and everything now happens on Base."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Aavegotchi migrated from Polygon to Base, Coinbase's Ethereum layer 2
          (chain id 8453), on July 25, 2025. Every gotchi, wearable, and parcel
          was mirrored to Base automatically by snapshot, so you did not need
          to bridge or migrate anything yourself. Your assets sit in the same
          wallet address, just on the Base network.
        </>
      }
      faqs={faqs}
      related={["get-started", "ghst", "baazaar", "what-is-aavegotchi"]}
    >
      <GuideSection title="What moved to Base?">
        <p>
          Everything. Gotchis, closed and open portals, wearables, REALM
          parcels, installations, Forge materials, and the GHST token all
          operate on Base now. The Baazaar marketplace, Gotchi lending, the
          Forge, and AavegotchiDAO voting run against the Base contracts. The
          official announcement is on the{" "}
          <a
            className="underline"
            href="https://blog.aavegotchi.com/aavegotchi-has-migrated-to-base/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Aavegotchi blog
          </a>
          .
        </p>
        <p>
          The move was a snapshot mirror, not a user-driven bridge: ownership
          was recorded on Polygon and the same assets were re-issued on Base to
          the same addresses. Equipped wearables stayed equipped, and gotchi
          names, kinship, XP, and traits carried over unchanged.
        </p>
      </GuideSection>

      <GuideSection title="What lives where now?">
        <ul className="list-disc pl-5">
          <li>
            Base: the live game. Gotchis, wearables, parcels, GHST, the
            Baazaar, lending, the Forge, and DAO voting.
          </li>
          <li>
            Polygon: archival only. The old contracts still exist on-chain,
            but they are not connected to the live game, marketplace, or
            rewards.
          </li>
          <li>
            Ethereum mainnet: only the original 2020-era GHST deployments,
            which are legacy.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="How do I set up my wallet for Base?">
        <p>
          Use the same wallet address you always did. Add the Base network
          (chain id 8453) in your wallet if it is not there already; most
          wallets ship with Base built in. Keep a small amount of ETH on Base
          for gas: transactions cost cents, but they are paid in ETH, not
          GHST or MATIC. When you connect to GotchiCloset on the wrong
          network, the app prompts you to switch to Base.
        </p>
      </GuideSection>

      <GuideSection title="How do I get GHST on Base?">
        <p>
          GHST is the currency for the Baazaar, lending, and the Forge. The{" "}
          <Link className="underline" to="/get-tokens">
            Get GHST page
          </Link>{" "}
          has an in-app instant swap (ETH, USDC, or WETH into GHST with live
          quotes), plus external routes: DEX swaps, bridging from another
          chain, or buying with a card. See the{" "}
          <Link className="underline" to="/guides/ghst">
            GHST guide
          </Link>{" "}
          for the full picture.
        </p>
      </GuideSection>

      <GuideSection title="What do old Aavegotchi guides get wrong?">
        <p>
          Most Aavegotchi content on the web predates July 2025 and describes
          Polygon. When you read an older guide, check it against this list:
        </p>
        <ul className="list-disc pl-5">
          <li>Contract addresses: Polygon-era addresses do not work on Base.</li>
          <li>Gas token: you need ETH on Base, not MATIC.</li>
          <li>
            Marketplace links: old app.aavegotchi.com Baazaar links point at
            the retired Polygon market. Use the Base-era{" "}
            <Link className="underline" to="/baazaar">
              Baazaar explorer
            </Link>{" "}
            instead.
          </li>
          <li>
            Community tools: many Polygon-era tools (optimizers, floor
            trackers) were never rebuilt for Base. GotchiCloset's{" "}
            <Link className="underline" to="/dress">
              dressing room
            </Link>{" "}
            and{" "}
            <Link className="underline" to="/wardrobe-lab">
              Wardrobe Lab
            </Link>{" "}
            are Base-native replacements.
          </li>
          <li>
            Anything dated before July 25, 2025 is Polygon-era: useful for
            history, wrong about where things are.
          </li>
        </ul>
      </GuideSection>
    </GuideLayout>
  );
}
