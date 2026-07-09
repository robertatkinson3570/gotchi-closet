import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How much does an Aavegotchi cost?",
    a: "Prices vary widely with rarity score, kinship, XP, and equipped wearables, so there is no fixed price: check live floor listings on the Baazaar before buying. Entry-level gotchis cost far less than high-BRS rarity farmers, and borrowing through Gotchi lending needs little or no GHST upfront.",
  },
  {
    q: "What is the cheapest way to try Aavegotchi?",
    a: "Borrow a gotchi through Gotchi lending. Many owners list gotchis at zero GHST upfront and take their share from what the borrower earns instead. You only need a wallet on Base and a little ETH for gas, so you can be petting and playing within minutes without buying anything.",
  },
  {
    q: "What happens when I open a portal?",
    a: "Opening a portal reveals ten candidate gotchis with randomly generated traits (randomness comes from a VRF, a verifiable random function). You compare their traits and rarity scores, pick one, and summon it by staking its required spirit force collateral. The nine gotchis you did not choose are gone forever.",
  },
];

const steps = [
  {
    name: "Set up a wallet on Base",
    text: "Install a wallet, add the Base network (chain id 8453), and fund it with a small amount of ETH on Base for gas.",
  },
  {
    name: "Get GHST",
    text: "Swap ETH or USDC into GHST on Base, using the in-app instant swap on the Get GHST page or any Base DEX.",
  },
  {
    name: "Pick your path: buy, summon, or borrow",
    text: "Buy a summoned gotchi on the Baazaar, buy and open a closed portal, or borrow a gotchi through lending for little or no upfront cost.",
  },
  {
    name: "Pet your gotchi",
    text: "Pet it right away and then once every 12 hours to build kinship.",
  },
  {
    name: "Equip wearables and check your BRS",
    text: "Preview outfits in the dressing room, equip wearables that push traits toward the extremes, and verify the rarity score change.",
  },
];

export default function GetStartedGuide() {
  return (
    <GuideLayout
      slug="get-started"
      seoTitle="How to Get an Aavegotchi in 2026: Buy, Summon, or Borrow"
      seoDescription="Three ways to get an Aavegotchi in 2026: buy one summoned on the Baazaar, open a portal, or borrow through Gotchi lending. Wallet setup, GHST, and a first-day checklist."
      h1="How to Get an Aavegotchi in 2026 (Buy, Summon, or Borrow)"
      dek="Every path into the game on Base, from a full Baazaar purchase down to borrowing a gotchi for free."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          There are three ways to get an Aavegotchi in 2026: buy one already
          summoned on the Baazaar, buy a closed portal and summon your own, or
          borrow one through Gotchi lending for little or no upfront cost.
          Everything happens on Base, so you need a wallet on Base, a little
          ETH for gas, and GHST for purchases.
        </>
      }
      faqs={faqs}
      related={["what-is-aavegotchi", "base-migration", "gotchi-lending", "kinship"]}
      extraJsonLd={[
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to get your first Aavegotchi",
          step: steps.map((s, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name: s.name,
            text: s.text,
          })),
        },
      ]}
    >
      <GuideSection title="What do I need before I start?">
        <p>
          A wallet on the Base network, a small amount of ETH on Base for gas,
          and GHST if you plan to buy anything. The{" "}
          <Link className="underline" to="/get-tokens">
            Get GHST page
          </Link>{" "}
          covers swapping, bridging, and card purchases. If you are coming
          from an old Polygon-era guide, read the{" "}
          <Link className="underline" to="/guides/base-migration">
            Base migration guide
          </Link>{" "}
          first: Aavegotchi has run entirely on Base since July 25, 2025.
        </p>
      </GuideSection>

      <GuideSection title="How do I buy a summoned gotchi?">
        <p>
          The fastest path. Browse the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar explorer
          </Link>
          , filter gotchis by price, rarity score, traits, and kinship, and
          buy the one you like with GHST. A summoned gotchi comes as-is: its
          six traits are fixed (wearables can shift the four core ones), and
          its kinship and XP history carry over to you. Purchases go through a
          front-run-protected function, so the transaction reverts if the
          listing changed under you.
        </p>
      </GuideSection>

      <GuideSection title="How does summoning from a portal work?">
        <p>
          Buy a closed portal on the Baazaar, then open it to reveal ten
          candidate gotchis with VRF-randomized traits. Compare their traits
          and base rarity scores, pick one, and claim it by staking its
          required spirit force (an interest-bearing collateral token held
          inside the gotchi). The other nine options disappear. Portals are a
          gamble: you might reveal a high-BRS gotchi, or ten average ones. The{" "}
          <a
            className="underline"
            href="https://wiki.aavegotchi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Aavegotchi wiki
          </a>{" "}
          documents portal mechanics in depth.
        </p>
      </GuideSection>

      <GuideSection title="How do I borrow a gotchi instead?">
        <p>
          Gotchi lending lets you use someone else's gotchi for an agreed
          period, usually splitting whatever it earns. Many listings charge
          zero GHST upfront, which makes borrowing the cheapest way to try the
          game. Browse live rentals on the{" "}
          <Link className="underline" to="/lending">
            lending page
          </Link>
          , and read the{" "}
          <Link className="underline" to="/guides/gotchi-lending">
            lending guide
          </Link>{" "}
          to understand revenue splits before you commit.
        </p>
      </GuideSection>

      <GuideSection title="What should I do on day one?">
        <ol className="list-decimal pl-5 space-y-1">
          {steps.map((s) => (
            <li key={s.name}>
              <span className="font-medium text-foreground">{s.name}.</span>{" "}
              {s.text}
            </li>
          ))}
        </ol>
        <p>
          For step five, use the{" "}
          <Link className="underline" to="/dress">
            dressing room
          </Link>{" "}
          to preview outfits before equipping, and the{" "}
          <Link className="underline" to="/rarity-score">
            rarity score guide
          </Link>{" "}
          to see exactly how BRS is calculated. Petting every 12 hours is
          covered in the{" "}
          <Link className="underline" to="/guides/kinship">
            kinship guide
          </Link>
          .
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
