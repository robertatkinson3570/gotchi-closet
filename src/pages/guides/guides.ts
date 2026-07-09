// Registry for the /guides section. Single source of truth for the guides
// index page, related-guides footers, and the sitemap-facing slug list.

export type GuideMeta = {
  slug: string;
  title: string;
  short: string;
};

export const GUIDES: GuideMeta[] = [
  {
    slug: "what-is-aavegotchi",
    title: "What Is Aavegotchi?",
    short: "The DeFi Tamagotchi on Base, explained from zero: gotchis, traits, wearables, and the DAO.",
  },
  {
    slug: "get-started",
    title: "How to Get an Aavegotchi in 2026",
    short: "Three ways in: buy one summoned on the Baazaar, open a portal, or borrow one through lending.",
  },
  {
    slug: "base-migration",
    title: "Aavegotchi on Base: The Migration Explained",
    short: "What moved to Base in July 2025, what changed, and where your gotchis and wearables are now.",
  },
  {
    slug: "ghst",
    title: "GHST: The Aavegotchi Token",
    short: "What GHST is used for on Base and the easiest ways to get it.",
  },
  {
    slug: "baazaar",
    title: "The Aavegotchi Baazaar Guide",
    short: "How to buy and sell gotchis, wearables, parcels, and Forge assets on Base, and what the fees are.",
  },
  {
    slug: "rarity-farming",
    title: "Rarity Farming in 2026",
    short: "How the GHST reward seasons work, the three leaderboards, and whether competing is worth it.",
  },
  {
    slug: "kinship",
    title: "Kinship and Petting",
    short: "The 12-hour petting schedule, decay, potions, and why kinship earns real GHST.",
  },
  {
    slug: "wearable-sets",
    title: "Wearable Sets and Set Bonuses",
    short: "How set bonuses stack on top of item modifiers and how to pick a set worth completing.",
  },
  {
    slug: "gotchi-lending",
    title: "Gotchi Lending, Explained",
    short: "Revenue splits, whitelists, and how to earn as an owner or play for free as a borrower.",
  },
  {
    slug: "forge",
    title: "The Forge: Crafting and Smelting",
    short: "Schematics, cores, alloy, essence, geodes, and the smelting math behind wearable supply.",
  },
  {
    slug: "gotchi-battler",
    title: "Gotchi Battler: Traits and Builds",
    short: "How trait extremes decide fights and how to build a battler with wearables.",
  },
  {
    slug: "valuation",
    title: "How Much Is Your Aavegotchi Worth?",
    short: "A practical valuation method: comparable sales, BRS percentile, wearable floors, and premiums.",
  },
];

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
