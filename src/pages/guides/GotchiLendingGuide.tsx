import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How do gotchi lending splits work?",
    a: "Every lending agreement sets three percentages that must total 100: the owner's share, the borrower's share, and an optional third address (often a guild). Tokens the gotchi earns during the rental accrue in escrow, and when the agreement ends the protocol pays each party its share automatically.",
  },
  {
    q: "Is gotchi lending safe?",
    a: "Yes, structurally: lending is escrowed by the Aavegotchi protocol on Base. The gotchi never leaves protocol custody, the borrower cannot sell or transfer it, and earned tokens sit in escrow until the agreement ends, when the split pays out automatically to owner, borrower, and any third address.",
  },
  {
    q: "Can you play Aavegotchi for free by borrowing?",
    a: "Yes. Many owners list gotchis at zero GHST upfront and earn through the revenue split instead. A borrower needs only a wallet on Base and a little ETH for gas. Browse live listings, agree to one, and you can be petting and playing within minutes without buying a gotchi.",
  },
];

export default function GotchiLendingGuide() {
  return (
    <GuideLayout
      slug="gotchi-lending"
      seoTitle="Gotchi Lending Explained: Splits, Whitelists, and Earning"
      seoDescription="How Aavegotchi Gotchi lending works on Base: the three-way revenue split, whitelists, what borrowers do, owner pricing strategy, and why escrow makes it safe."
      h1="Gotchi Lending, Explained: Splits, Whitelists, and Earning as Owner or Borrower"
      dek="The built-in rental system: how the three-way split pays out, and strategy for both sides of the deal."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Gotchi lending is Aavegotchi's built-in rental system on Base.
          Owners list gotchis with an upfront fee, a duration, and a revenue
          split; borrowers use the gotchi and share what it earns. The
          protocol escrows everything, so the gotchi can never be stolen and
          the split pays out automatically when the rental ends.
        </>
      }
      faqs={faqs}
      related={["get-started", "kinship", "rarity-farming", "what-is-aavegotchi"]}
    >
      <GuideSection title="How does the three-way split work?">
        <p>
          Each listing defines three shares that add up to 100%: owner,
          borrower, and an optional third address. Every token the gotchi
          earns during the rental accrues to escrow and is divided by those
          percentages at settlement.
        </p>
        <p>
          A worked example (illustrative numbers): an owner lists a gotchi at
          0 GHST upfront with a 60/30/10 split. The borrower plays for the
          rental period and the gotchi earns 100 tokens. At settlement the
          owner receives 60 tokens, the borrower 30, and the third address 10,
          with no manual settling-up required. Change the percentages and the
          same machinery applies.
        </p>
      </GuideSection>

      <GuideSection title="What are whitelists?">
        <p>
          A whitelist restricts who may borrow: only addresses on the list
          can agree to the rental. Owners use whitelists for guild-only
          rentals, deals arranged with specific players, or keeping gotchis
          circulating among trusted borrowers. You can create and manage
          yours in the{" "}
          <Link className="underline" to="/lending/whitelists">
            whitelist manager
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection title="What does a borrower actually do?">
        <p>
          Whatever the terms allow: pet the gotchi (which grows its kinship),
          claim alchemica, channel on land if the owner granted channeling
          rights, and play trait-based games. Borrowers cannot transfer,
          sell, or re-lend the gotchi; those rights never leave the protocol
          escrow. When the agreed time passes, either side can close the
          rental and the split settles.
        </p>
      </GuideSection>

      <GuideSection title="How should owners price and manage listings?">
        <ul className="list-disc pl-5">
          <li>
            Price from data, not guesswork:{" "}
            <Link className="underline" to="/lending/analytics">
              lending analytics
            </Link>{" "}
            shows market-wide rates, durations, and splits, and GotchiCloset
            can suggest competitive terms from comparable live rentals.
          </li>
          <li>
            Use auto-renew so a rental relists itself when it ends, keeping
            the gotchi earning without manual work.
          </li>
          <li>
            Bulk-list if you run many gotchis; one flow lists them all.
          </li>
          <li>
            Remember you can still pet a rented-out gotchi, so an active
            lending schedule does not break a kinship streak. See the{" "}
            <Link className="underline" to="/guides/kinship">
              kinship guide
            </Link>
            .
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="How do borrowers get started?">
        <p>
          Browse open listings on the{" "}
          <Link className="underline" to="/lending">
            lending page
          </Link>
          , compare upfront cost, duration, and split, and agree to one.
          Zero-upfront listings make this the cheapest entry into Aavegotchi;
          the full beginner path is in the{" "}
          <Link className="underline" to="/guides/get-started">
            getting started guide
          </Link>
          . Lending mechanics are also documented on the{" "}
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
    </GuideLayout>
  );
}
