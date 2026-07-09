import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "What is GHST used for?",
    a: "GHST is the currency of the Aavegotchi ecosystem on Base. It pays for gotchis, portals, and wearables on the Baazaar, settles Gotchi lending fees and revenue splits, feeds the Forge economy, funds rarity farming reward pools, and counts toward AavegotchiDAO voting power on Snapshot.",
  },
  {
    q: "What chain is GHST on?",
    a: "GHST lives on Base, Aavegotchi's home network since July 2025. It is the currency for the Baazaar marketplace, portal purchases, Gotchi lending fees, and DAO governance, and it funds rarity farming reward pools. Earlier Polygon and Ethereum GHST deployments are legacy.",
  },
  {
    q: "How do I buy GHST on Base?",
    a: "Swap into GHST on a Base DEX (Aerodrome, Uniswap, or CowSwap), bridge funds from another chain and then swap, or buy with a card through an onramp. GotchiCloset's Get GHST page bundles all three routes, including an in-app instant swap from ETH, USDC, or WETH with live quotes.",
  },
];

export default function GhstGuide() {
  return (
    <GuideLayout
      slug="ghst"
      seoTitle="What Is GHST? The Aavegotchi Token on Base, Explained"
      seoDescription="GHST is the Aavegotchi ecosystem token on Base: what it is used for (Baazaar, portals, lending, DAO voting, rarity farming) and how to get it."
      h1="GHST: The Aavegotchi Token on Base and Everything It's Used For"
      dek="The ecosystem currency explained: every sink, every source, and how to get it on Base."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          GHST is the utility token of the Aavegotchi ecosystem, and it lives
          on Base (chain id 8453), Aavegotchi's home network since July 2025.
          It is the currency for the Baazaar marketplace, portal purchases,
          wearables, Gotchi lending, and the Forge, and it powers AavegotchiDAO
          governance and rarity farming reward pools.
        </>
      }
      faqs={faqs}
      related={["base-migration", "baazaar", "what-is-aavegotchi", "rarity-farming"]}
    >
      <GuideSection title="What is GHST used for?">
        <ul className="list-disc pl-5">
          <li>
            Baazaar trading: every gotchi, portal, wearable, parcel, and Forge
            item on the{" "}
            <Link className="underline" to="/baazaar">
              Baazaar
            </Link>{" "}
            is priced and settled in GHST.
          </li>
          <li>
            Summoning: buying portals and claiming gotchis runs on GHST.
          </li>
          <li>
            Gotchi lending: upfront rental fees and escrowed revenue splits
            are denominated in GHST. See the{" "}
            <Link className="underline" to="/guides/gotchi-lending">
              lending guide
            </Link>
            .
          </li>
          <li>
            DAO governance: GHST you hold and stake contributes to your
            AavegotchiDAO voting power on Snapshot, visible on the{" "}
            <Link className="underline" to="/dao">
              DAO dashboard
            </Link>
            .
          </li>
          <li>
            Rarity farming: seasonal reward pools that pay the rarity,
            kinship, and XP leaderboards are funded in GHST.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="How do I get GHST on Base?">
        <p>
          Three routes, all collected on the{" "}
          <Link className="underline" to="/get-tokens">
            Get GHST page
          </Link>
          :
        </p>
        <ul className="list-disc pl-5">
          <li>
            Swap on Base: the in-app instant swap converts ETH, USDC, or WETH
            into GHST with a live quote, minimum-received amount, and slippage
            shown. External venues include CowSwap, Aerodrome, and Uniswap.
          </li>
          <li>
            Bridge: move funds from Ethereum, Polygon, or another chain to
            Base with a bridge aggregator, then swap.
          </li>
          <li>
            Buy with card: onramps such as Coinbase, MoonPay, and Transak
            deliver directly to Base.
          </li>
        </ul>
        <p>
          Whichever route you take, keep a little ETH on Base for gas:
          transactions are paid in ETH, not GHST.
        </p>
      </GuideSection>

      <GuideSection title="Where did GHST come from?">
        <p>
          GHST launched in 2020 through a public bonding curve sale, initially
          on Ethereum, and followed the game to Polygon and then to Base in
          July 2025. The Base deployment is the canonical one today; Ethereum
          and Polygon balances are legacy and need bridging to be useful. The
          token's history and mechanics are documented on the{" "}
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

      <GuideSection title="Is GHST an investment?">
        <p>
          Treat GHST as what it is designed to be: the working currency of a
          game economy. Its sinks (marketplace fees, forging, summoning) and
          sources are gameplay-driven. Nothing on this page is financial
          advice; if you only need GHST to play, buy what you plan to spend.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
