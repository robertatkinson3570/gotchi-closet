// Knowledge the companion draws on. SITE_OVERVIEW is always injected so the gotchi
// foremost knows what GotchiCloset is and how to help. The tagged snippets below are
// keyword-retrieved per message for accurate, specific how-to answers.

export const SITE_OVERVIEW =
  "You live on GotchiCloset — a companion web app for managing Aavegotchis on Base. " +
  "Your FIRST job is to help your owner use this site. Its sections (top nav) are: " +
  "Explorer / Baazaar (browse & search gotchis and wearables, view listings, buy and sell); " +
  "Dress (equip wearables on your gotchis and optimize look, sets, and rarity); " +
  "Activity (recent on-chain activity); " +
  "Forge (craft and smelt wearables from alchemica + GHST); " +
  "Lending (rent your gotchis out, manage rentals and auto-renew, set channelling rights for renters); " +
  "Land Management (channel & claim alchemica from your land parcels). " +
  "Pet your gotchi about every 12 hours to grow kinship.";

interface LoreSnippet { tags: string[]; text: string; }

// Site-specific how-to first (these take priority in retrieval), then general lore.
const LORE: LoreSnippet[] = [
  { tags: ["channel", "channelling", "channeling", "alchemica", "claim", "harvest", "fud", "fomo", "alpha", "kek", "parcel", "land", "altar"],
    text: "To channel/claim alchemica on GotchiCloset, go to the Land Management section (top nav) and channel & claim from your parcels. If a gotchi is rented out, only petting works until the rental ends. When you list a gotchi under Lending you can grant the renter channelling rights." },
  { tags: ["equip", "wearable", "dress", "outfit", "slot"],
    text: "Equip wearables in the Dress section: pick a gotchi and add wearables to its slots. Wearables modify traits; completing a full Set grants bonus trait boosts and rarity (BRS)." },
  { tags: ["rent", "lend", "lending", "borrow", "rental", "auto-renew", "autorenew", "list for rent", "whitelist"],
    text: "Rent your gotchis out from the Lending section: list a gotchi, set the price and duration, choose the revenue split, and optionally enable auto-renew and channelling rights for the renter." },
  { tags: ["buy", "sell", "baazaar", "bazaar", "market", "price", "listing", "explorer", "search", "floor"],
    text: "Browse and trade in Explorer / Baazaar: search gotchis and wearables, view listings and prices, and buy or list items for sale." },
  { tags: ["forge", "craft", "smelt", "schematic", "geode"],
    text: "Craft and smelt wearables in the Forge section using alchemica and GHST." },
  { tags: ["pet", "petting", "kinship", "interact", "bond"],
    text: "Pet your gotchi to raise kinship — interact about once every 12 hours; neglect lowers it. Petting works even while a gotchi is rented out." },
  { tags: ["rarity", "brs", "rarity farming", "score"],
    text: "Base Rarity Score (BRS) sums how far each trait sits from the average; rarer extremes and equipped wearables/sets raise it. You can optimize BRS in the Dress section." },
  { tags: ["trait", "nrg", "agg", "spk", "brn", "energy", "aggression", "spookiness", "brain"],
    text: "The four spectrum traits are Energy (NRG), Aggression (AGG), Spookiness (SPK), and Brain Size (BRN), each on a bell curve where both extremes are rare and powerful. Equipping wearables shifts these." },
  { tags: ["portal", "summon", "haunt"],
    text: "Aavegotchis are summoned from Portals. Haunts (H1, H2) are limited summoning waves; your hauntId marks which one you came from." },
  { tags: ["collateral", "atoken", "aave", "stake"],
    text: "Every gotchi is backed by an Aave interest-bearing collateral token (an aToken); that staked value is your spirit-force." },
  { tags: ["ghst", "currency", "token"],
    text: "GHST is the Aavegotchi currency — used in the Baazaar, the Forge, and for summoning." },
];

export function retrieveLore(message: string, max = 4): string[] {
  const m = message.toLowerCase();
  const hits: string[] = [];
  for (const s of LORE) {
    if (s.tags.some((tag) => m.includes(tag))) hits.push(s.text);
    if (hits.length >= max) break;
  }
  return hits;
}
