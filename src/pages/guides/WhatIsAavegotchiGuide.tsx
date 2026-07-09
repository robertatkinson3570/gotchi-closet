import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "Is Aavegotchi free to play?",
    a: "You can play without buying anything by borrowing a gotchi through Gotchi lending: many owners list gotchis at zero GHST upfront and take their share from what the borrower earns. Owning a gotchi costs money (a Baazaar purchase or a portal), but borrowing needs only a wallet and gas.",
  },
  {
    q: "What blockchain is Aavegotchi on?",
    a: "Aavegotchi runs on Base, Coinbase's Ethereum layer 2 (chain id 8453). It migrated there from Polygon on July 25, 2025, with every asset mirrored automatically. The GHST token, Baazaar marketplace, Gotchi lending, the Forge, and DAO governance all operate on Base today.",
  },
  {
    q: "Is Aavegotchi still active in 2026?",
    a: "Yes. The Baazaar marketplace, Gotchi lending, the Forge, rarity farming, and AavegotchiDAO governance are all live on Base, with on-chain trading and petting activity every day. You can verify this yourself: GotchiCloset's Pulse and Stats pages chart live protocol activity directly from the chain.",
  },
];

export default function WhatIsAavegotchiGuide() {
  return (
    <GuideLayout
      slug="what-is-aavegotchi"
      seoTitle="What Is Aavegotchi? The DeFi Tamagotchi on Base, Explained"
      seoDescription="Aavegotchi is a blockchain game of pixel ghost NFTs backed by DeFi collateral, running on Base. The game loop, what makes it different, and how to start in 2026."
      h1="What Is Aavegotchi? The DeFi Tamagotchi on Base, Explained"
      dek="Pixel ghosts, DeFi collateral, on-chain wearables, and a player-run DAO: the whole picture."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Aavegotchi is a blockchain game by Pixelcraft Studios in which
          players own pixel ghost NFTs, called gotchis, that are backed by
          yield-bearing collateral from the Aave protocol. Often described as
          the crypto Tamagotchi, it combines pet care, an on-chain wearables
          economy, and DAO governance, and it runs on Base.
        </>
      }
      faqs={faqs}
      related={["get-started", "base-migration", "ghst", "kinship"]}
    >
      <GuideSection title="How does the game loop work?">
        <ul className="list-disc pl-5">
          <li>
            Summon: gotchis come out of portals; opening one reveals ten
            candidates and you claim one by staking its collateral (its
            spirit force).
          </li>
          <li>
            Dress: equip wearables into 16 slots. Wearables are NFTs that
            shift a gotchi's traits and raise its rarity score. Preview any
            outfit in the{" "}
            <Link className="underline" to="/dress">
              dressing room
            </Link>
            .
          </li>
          <li>
            Pet: interact every 12 hours to grow kinship, the loyalty stat.
            See the{" "}
            <Link className="underline" to="/guides/kinship">
              kinship guide
            </Link>
            .
          </li>
          <li>
            Earn: compete in rarity farming, lend your gotchi out, or trade
            on the Baazaar.
          </li>
          <li>
            Battle: trait builds fight in the community game Gotchi Battler.
            See the{" "}
            <Link className="underline" to="/guides/gotchi-battler">
              battler guide
            </Link>
            .
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="What makes Aavegotchi different from other NFT games?">
        <ul className="list-disc pl-5">
          <li>
            DeFi collateral: every gotchi holds staked, interest-bearing Aave
            collateral inside it, so the NFT has a redeemable floor value by
            construction.
          </li>
          <li>
            On-chain wearables that matter: wearables are not cosmetic
            JPEGs; they modify the four core traits (energy, aggression,
            spookiness, brain size) and add rarity score, which drives real
            GHST rewards. Browse all 300+ in the{" "}
            <Link className="underline" to="/wearables">
              wearables database
            </Link>
            .
          </li>
          <li>
            A player-run DAO: AavegotchiDAO votes on game economics,
            marketplace fees, and reward pools through Snapshot, with voting
            power from GHST and game assets.
          </li>
        </ul>
        <p>
          The official site is{" "}
          <a
            className="underline"
            href="https://www.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            aavegotchi.com
          </a>
          , and the{" "}
          <a
            className="underline"
            href="https://wiki.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            community wiki
          </a>{" "}
          is the deepest reference.
        </p>
      </GuideSection>

      <GuideSection title="What is the state of Aavegotchi in 2026?">
        <p>
          Fully on Base. The game migrated from Polygon on July 25, 2025, with
          every asset mirrored automatically (the{" "}
          <Link className="underline" to="/guides/base-migration">
            migration guide
          </Link>{" "}
          has the details). The Baazaar, lending, the Forge, rarity farming
          seasons, and DAO governance are all live on Base, and live activity
          is observable on{" "}
          <Link className="underline" to="/pulse">
            Pulse
          </Link>{" "}
          and{" "}
          <Link className="underline" to="/stats">
            Stats
          </Link>
          . Content written before July 2025 describes the Polygon era and is
          archival.
        </p>
      </GuideSection>

      <GuideSection title="How does GotchiCloset fit in?">
        <p>
          GotchiCloset is a free, community-built toolkit for the Base era: a
          wearable fitting room, a full{" "}
          <Link className="underline" to="/sets">
            set and wearable database
          </Link>
          , a{" "}
          <Link className="underline" to="/rarity-score">
            rarity score calculator
          </Link>
          , a Baazaar explorer, and lending management, all non-custodial. It
          is not operated by Pixelcraft Studios.
        </p>
      </GuideSection>

      <GuideSection title="How do I start?">
        <p>
          Three paths: buy a summoned gotchi, open a portal, or borrow one
          nearly free through lending. The{" "}
          <Link className="underline" to="/guides/get-started">
            getting started guide
          </Link>{" "}
          walks through all three with a first-day checklist.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
