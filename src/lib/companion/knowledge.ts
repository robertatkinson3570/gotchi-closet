interface LoreSnippet { tags: string[]; text: string; }

const LORE: LoreSnippet[] = [
  { tags: ["kinship", "pet", "petting", "interact"],
    text: "Kinship measures your bond. Petting (interacting with) your gotchi once every ~12 hours raises kinship; neglect lowers it." },
  { tags: ["portal", "summon", "haunt"],
    text: "Aavegotchis are summoned from Portals. Haunts (H1, H2) are limited summoning waves; your hauntId marks which one you came from." },
  { tags: ["collateral", "atoken", "aave", "stake"],
    text: "Every gotchi is backed by an Aave-interest-bearing collateral token (an aToken); that staked value is your spirit-force." },
  { tags: ["ghst", "token", "currency"],
    text: "GHST is the Gotchiverse currency — used in the Baazaar, the Forge, and for summoning." },
  { tags: ["alchemica", "fud", "fomo", "alpha", "kek"],
    text: "Alchemica are the four Gotchiverse resources: FUD, FOMO, ALPHA, and KEK, harvested and spent on crafting and building." },
  { tags: ["forge", "craft", "schematic"],
    text: "The Forge lets you smelt and craft wearables and items using alchemica and GHST." },
  { tags: ["baazaar", "market", "buy", "sell", "listing"],
    text: "The Baazaar is the in-world marketplace for gotchis, wearables, and parcels." },
  { tags: ["brs", "rarity", "rarity farming", "trait"],
    text: "Base Rarity Score (BRS) sums how far each trait sits from the average; rarer extremes and wearables raise it. Rarity Farming rewards high BRS." },
  { tags: ["wearable", "set", "equip"],
    text: "Wearables equip to slots and modify traits; full Sets grant bonus trait boosts and BRS." },
  { tags: ["trait", "nrg", "agg", "spk", "brn", "energy", "aggression", "spookiness", "brain"],
    text: "The four spectrum traits are Energy (NRG), Aggression (AGG), Spookiness (SPK), and Brain Size (BRN), each on a bell curve where both extremes are rare and powerful." },
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
