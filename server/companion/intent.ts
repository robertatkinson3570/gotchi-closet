// Deterministic intent detection for the companion. The site is small and its routes are a fixed
// set, so navigation must NOT depend on the LLM reliably picking a tool (llama under-calls it and
// just describes the page). We map a "go there" message straight to a route here.

// keyword -> route. Ordered: more specific (lands/parcels) before the generic /lending.
const NAV_TABLE: [RegExp, string][] = [
  [/\b(baazaar|bazaar|marketplace|market|deals?|listings?|for sale|shop|buy)\b/i, "/baazaar"],
  [/\b(lands?|parcels?|reservoirs?)\b/i, "/lending/lands"],
  [/\b(lend\w*|lent|rent\w*|borrow\w*)\b/i, "/lending"],
  [/\b(get[\s-]?tokens|swap|get alchemica|buy alchemica|sell alchemica)\b/i, "/get-tokens"],
  [/\b(forge|geode|schematic)\b/i, "/forge"],
  [/\b(staking|stake)\b/i, "/staking"],
  [/\b(dao|governance|proposals?|voting|vote|snapshot|agip)\b/i, "/dao"],
  [/\b(leaderboard|rankings?)\b/i, "/leaderboard"],
  [/\b(pulse|stats|metrics|analytics)\b/i, "/pulse"],
  [/\b(explorer|browse|explore|gallery)\b/i, "/explorer"],
  [/\b(games?|arcade)\b/i, "/games"],
  [/\b(megaphone|content videos?|video library)\b/i, "/megaphone"],
];

// A "take me there" verb/deixis. Required so data questions ("any deals now?", "what lendings do
// i have?") fall through to the data path instead of being hijacked into navigation.
const MOTION = /\b(go\s*to|goto|go|take me|bring me|open|show me|show|navigate|nav|head (?:to|over)|jump to|visit|lemme see|see the|to the|where(?:'s| is| are)?)\b/i;

/** Maps a clear "go to <page>" message to a route, or null when it isn't a navigation request. */
export function detectNav(message: string): string | null {
  const m = message.toLowerCase();
  if (!MOTION.test(m)) return null;
  for (const [re, route] of NAV_TABLE) if (re.test(m)) return route;
  return null;
}

/** KEEPER GOTCHI (08-wisp-chat.md §8.2): a keyed third-party app's own
 *  routes. `navMap` is the key's context (word -> path, keys already
 *  lowercased by the accounts validator); the same MOTION gate as the site's
 *  own table, longer words first so "my plots" beats "plots". */
export function detectNavFrom(message: string, navMap: Record<string, string>): string | null {
  const m = message.toLowerCase();
  if (!MOTION.test(m)) return null;
  const keys = Object.keys(navMap).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(m)) return navMap[key]!;
  }
  return null;
}

const HELP = /\b(help|what can you (?:do|help)|what (?:do|can) you do|commands?|list commands?|abilities|features|capabilit|how do you work|what are you (?:able|capable))\b/i;

/** True when the owner is asking what the companion can do. */
export function isHelpIntent(message: string): boolean {
  return HELP.test(message.toLowerCase());
}

// Concise capabilities list, returned verbatim (deterministic) so it never hallucinates its own
// feature set. Grouped by act / navigate / know.
export const CAPABILITIES_REPLY = [
  "here's what i can do for you 👻",
  "",
  "⚡ ACT on-chain (you approve in your wallet):",
  "• \"empty my reservoirs\" / \"channel my gotchis\" / \"claim alchemica\" — collect what's due",
  "• flip on Auto-collect and i'll keep your reservoirs emptied hands-free",
  "",
  "🧭 TAKE YOU ANYWHERE — just say \"take me to…\":",
  "• the Baazaar / deals · your Lands & reservoirs · Lending & rentals · Get-Tokens (swap)",
  "• Forge · Staking · DAO · Leaderboard · Pulse · Explorer · Games",
  "",
  "🔎 ANSWER from live data:",
  "• \"what do i own?\" and \"what am i renting out?\" — your gotchis, owned vs rented",
  "• \"any deals now?\" — cheapest Baazaar listings + best BRS/GHST value",
  "• \"what proposals are live?\" — current DAO votes",
  "• \"what's due?\" — upkeep ready to collect",
  "",
  "just talk to me normally — i'll do the thing or take you there.",
].join("\n");
