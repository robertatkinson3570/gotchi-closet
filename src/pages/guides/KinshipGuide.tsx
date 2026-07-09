import { Link } from "react-router-dom";
import { GuideLayout, GuideSection } from "./GuideLayout";

const faqs = [
  {
    q: "How often should I pet my Aavegotchi?",
    a: "Pet your Aavegotchi once every 12 hours. Each on-time pet adds kinship, and consistent 12-hour petting is the only free way to climb the kinship leaderboard, which pays a share of every rarity farming season's GHST pool. Missed days cause kinship to decay.",
  },
  {
    q: "What happens if I stop petting my gotchi?",
    a: "Kinship decays. Once you neglect a gotchi, its kinship score starts falling instead of rising, undoing the streak you built. The decay continues until you interact again, so a long absence can erase months of consistent petting. Petting still works while a gotchi is listed for sale or rented out.",
  },
  {
    q: "Can someone else pet my gotchi for me?",
    a: "Yes. Aavegotchi supports a pet operator: an address you authorize to pet all of your gotchis on your behalf. The authorization grants petting only, never transfer rights, so it is safe to point at a petting service or a trusted friend when you cannot keep the 12-hour schedule yourself.",
  },
];

export default function KinshipGuide() {
  return (
    <GuideLayout
      slug="kinship"
      seoTitle="Aavegotchi Kinship: Petting Schedules, Decay, and Potions"
      seoDescription="How Aavegotchi kinship works: one point per pet every 12 hours, decay when neglected, kinship potions, the 20% rarity farming pool, and pet operators."
      h1="Kinship: How Petting Schedules and Potions Raise Your Gotchi's Score"
      dek="The loyalty stat explained: the 12-hour rhythm, what neglect costs, and why kinship pays real GHST."
      updated="July 9, 2026"
      updatedIso="2026-07-09"
      lead={
        <>
          Kinship is Aavegotchi's loyalty score: it measures how consistently
          you interact with your gotchi. Petting once every 12 hours adds one
          kinship point per pet, and neglect makes the score decay. Kinship
          matters because the kinship leaderboard earns 20% of every rarity
          farming season's GHST pool.
        </>
      }
      faqs={faqs}
      related={["rarity-farming", "get-started", "gotchi-lending", "what-is-aavegotchi"]}
    >
      <GuideSection title="How does petting work?">
        <p>
          Petting is an on-chain interaction you can trigger from GotchiCloset
          or the official app. Each pet adds one kinship point, and a new pet
          only counts once the 12-hour cooldown from the previous pet has
          passed. Two on-time pets per day is the maximum natural growth rate,
          which is why kinship is prized: it cannot be bought outright, only
          accumulated with time and consistency. Mechanics are documented on
          the{" "}
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
        <p>
          Petting keeps working while a gotchi is listed for sale or rented
          out, so an active lending schedule does not have to interrupt a
          kinship streak.
        </p>
      </GuideSection>

      <GuideSection title="What are kinship potions?">
        <p>
          Kinship potions are consumable items that add kinship directly when
          applied to a gotchi. They trade on the{" "}
          <Link className="underline" to="/baazaar">
            Baazaar
          </Link>{" "}
          in the consumables category, and you apply them from the gotchi's
          manage view. Potions are the only shortcut around the 12-hour
          rhythm, which makes them useful for repairing a broken streak, but
          expensive as a primary strategy compared with simply petting on
          time.
        </p>
      </GuideSection>

      <GuideSection title="Why does kinship matter?">
        <ul className="list-disc pl-5">
          <li>
            Rarity farming: the kinship leaderboard receives 20% of each
            season's GHST pool, and it is the one board that costs nothing to
            climb. See the{" "}
            <Link className="underline" to="/guides/rarity-farming">
              rarity farming guide
            </Link>
            .
          </li>
          <li>
            Gotchiverse channeling: kinship has historically influenced how
            much alchemica a gotchi channels, so high-kinship gotchis were
            more productive on land.
          </li>
          <li>
            Resale value: buyers pay premiums for high-kinship gotchis because
            the score represents time that cannot be recreated quickly. See
            the{" "}
            <Link className="underline" to="/guides/valuation">
              valuation guide
            </Link>
            .
          </li>
        </ul>
        <p>
          Track where your gotchis stand on the{" "}
          <Link className="underline" to="/leaderboard">
            kinship and XP leaderboard
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection title="Should I use a pet operator or autopetter?">
        <p>
          If you cannot hold a 12-hour schedule, delegate. Setting a pet
          operator authorizes another address to pet all your gotchis; it
          grants petting rights only, so the operator can never move or sell
          anything. Automated petting services typically charge a fee, so the
          tradeoff is simple: pay a little for perfect consistency, or pet
          manually for free and accept the risk of missed windows. For a
          serious kinship-board run, consistency usually wins.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
