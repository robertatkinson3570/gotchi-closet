// Canonical knowledge base for GotchiCloset. Single source of truth consumed by
// BOTH the on-site Guide modal (KnowledgeBaseModal) and the Gotchi Companion's
// grounding (src/lib/companion/knowledge.ts via retrieveKB / knowledgeBaseText).
// For the companion this is an ADDITIONAL reference resource — it supplements,
// never replaces, the companion's own SITE_OVERVIEW + LORE.
// Keep it accurate to the shipped app — it's the legend users and the companion rely on.

export type KBItem = { heading: string; body: string; tags?: string[] };
export type KBSection = { id: string; title: string; emoji: string; blurb: string; items: KBItem[] };

export const KB_SECTIONS: KBSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    emoji: "👋",
    blurb: "What GotchiCloset is and how to begin.",
    items: [
      { heading: "What is GotchiCloset?", body: "A community-built, non-custodial web app for the full Aavegotchi experience on the Base chain: browse and trade the Baazaar, bid in auctions, manage and pet your gotchis, equip wearables, rent/lend, forge, manage land, follow activity & stats, and take part in the DAO — all from one place.", tags: ["what is", "gotchicloset", "about", "overview", "app"] },
      { heading: "Non-custodial & safe", body: "GotchiCloset never holds your keys, seed phrase, or assets. Every action that moves an asset is a transaction you sign yourself in your own wallet. Token approvals only ever go to the official Aavegotchi / GBM / Forge contracts on Base — never to GotchiCloset.", tags: ["safe", "safety", "custody", "non-custodial", "approval", "secure", "scam"] },
      { heading: "Connect your wallet", body: "Click Connect (top right) and approve the connection in your wallet, then make sure you're on the Base network. The app prompts you to switch to Base if you're on the wrong chain.", tags: ["connect", "wallet", "login", "base", "network", "switch"] },
      { heading: "Get GHST to spend", body: "GHST is the currency for buying, bidding, forging and summoning. Use the Get GHST page to swap (CowSwap/Aerodrome/Uniswap), bridge from another chain (Bungee/Socket), or buy with card (Coinbase/MoonPay/Transak) — all targeting GHST on Base.", tags: ["ghst", "get ghst", "buy ghst", "swap", "bridge", "onramp", "fund"] },
    ],
  },
  {
    id: "explorer-baazaar",
    title: "Explorer & Baazaar",
    emoji: "🛒",
    blurb: "Browse, search and buy everything in the marketplace.",
    items: [
      { heading: "The Explorer hub", body: "Explorer is the single hub for browsing and buying. Asset tabs: Gotchis, Wearables, Items (consumables), Parcels, Installations, Tiles, Portals, FAKE Gotchis, FAKE Cards, Forge items, Guardian Skins, and Auctions. Each tab defaults to recently-listed.", tags: ["explorer", "baazaar", "bazaar", "browse", "market", "tabs", "search"] },
      { heading: "Filters, sort & search", body: "Every tab has a left filter panel (price, rarity, traits, sets, size/district for parcels, level/type for installations, etc.) plus sort (recently listed, price, rarity, ID, kinship, XP) and an ID/name search. Filters live in the sidebar on desktop and a sheet on mobile.", tags: ["filter", "sort", "search", "price", "rarity", "traits"] },
      { heading: "Buying", body: "Click Buy on any listing. The app first ensures GHST is approved to the Aavegotchi diamond, then executes the purchase via the front-run-protected function (the transaction reverts if the listing changed), so you never overpay. You can multi-select and bulk-buy.", tags: ["buy", "purchase", "buy now", "bulk buy", "cart", "checkout"] },
      { heading: "Make an Offer (buy orders)", body: "On gotchis, wearables and items, use Make Offer to place a Baazaar buy order: enter a price (and quantity for items), pick an expiry (1/3/7/30 days or none). Your GHST is escrowed to the Aavegotchi diamond and refunded if you cancel or it expires; the owner can fill it any time.", tags: ["offer", "make offer", "buy order", "bid offer", "escrow"] },
      { heading: "FAKE Gotchis, Guardians & Forge items", body: "Beyond the core collections you can trade FAKE Gotchis & FAKE Cards (community art NFTs), Guardian Skins, and Forge items (alloy/essence/geodes/cores) — each as its own Explorer tab with buy + offer.", tags: ["fake gotchi", "fake card", "guardian", "guardian skin", "forge item", "collection"] },
    ],
  },
  {
    id: "manage-gotchis",
    title: "Owning & Managing Gotchis",
    emoji: "👻",
    blurb: "Everything you can do with gotchis you own.",
    items: [
      { heading: "Your owned assets", body: "Switch the Explorer to the Owned scope (or open it connected) to see your gotchis, wearables, items, parcels and token balances. Click a gotchi to open the manage modal.", tags: ["owned", "my gotchis", "my assets", "inventory", "manage"] },
      { heading: "Pet (kinship)", body: "Pet your gotchi roughly every 12 hours to grow its kinship; neglect lowers it. Petting still works while a gotchi is rented out or listed.", tags: ["pet", "petting", "kinship", "interact", "bond"] },
      { heading: "Spend skill points & respec", body: "Spend earned skill points to boost a gotchi's four spectrum traits, or Respec to reset spent points back to base (first respec per gotchi is free; later ones charge a small fee).", tags: ["skill points", "spend skill", "respec", "reset", "traits"] },
      { heading: "Rename, transfer, sacrifice", body: "Set your gotchi's name, transfer it to another address, or Sacrifice it — which destroys the gotchi, returns its staked collateral, and transfers its XP to another gotchi you choose.", tags: ["rename", "name", "transfer", "send", "sacrifice", "destroy", "xp transfer"] },
      { heading: "Use consumables", body: "Apply consumables you hold (XP potions, Greater XP potions, kinship potions, etc.) to a gotchi from the manage modal — it shows each consumable's effect and how many you own.", tags: ["consumable", "use item", "xp potion", "kinship potion", "potion"] },
      { heading: "GHST pocket (escrow)", body: "Each gotchi has an escrow wallet that can hold GHST (its 'pocket'). You can withdraw GHST from your gotchi's escrow to your wallet from the manage modal.", tags: ["pocket", "escrow", "withdraw", "ghst pocket", "stake"] },
      { heading: "Equip wearables", body: "Open the equip modal to put wearables into a gotchi's 16 slots. Wearables shift traits; completing a full Set grants bonus trait boosts and rarity (BRS). Save outfits for reuse.", tags: ["equip", "wearable", "dress", "outfit", "slot", "set"] },
      { heading: "Bulk list & set pet operator", body: "Bulk-list several owned gotchis (or items) for sale in one flow. Set Pet Operator lets you authorize another address (a pet bot or friend) to pet ALL your gotchis — it grants petting only, never transfer rights.", tags: ["bulk list", "list many", "pet operator", "petting access", "bot"] },
      { heading: "Open portals & summon", body: "Own a closed portal? Open it to reveal 10 candidate gotchis, compare their traits/BRS, then claim (summon) the one you want. Opened portals show a 'Choose Gotchi' action.", tags: ["portal", "open portal", "summon", "claim", "choose gotchi", "haunt"] },
      { heading: "Rented / borrowed limits", body: "If a gotchi is rented out or borrowed, only petting (and claiming alchemica) is available until the rental ends — other actions are locked. Listed-for-sale gotchis allow petting and editing the listing.", tags: ["rented", "borrowed", "locked", "rental", "limits"] },
    ],
  },
  {
    id: "auctions",
    title: "Auctions (GBM)",
    emoji: "🔨",
    blurb: "Bid on live GBM auctions.",
    items: [
      { heading: "How GBM auctions work", body: "The Auctions tab shows live GBM auctions (gotchis, parcels, items and more). Place a bid in GHST that exceeds the current top bid; the app approves GHST to the GBM diamond then commits your bid. GBM rewards being outbid with incentives.", tags: ["auction", "gbm", "bid", "bidding", "commit bid", "outbid"] },
      { heading: "Reading an auction", body: "Each card shows the item, top bid, top bidder, seller, total bids and time remaining. Click for full detail and to bid. Gotchi auctions show full traits so you can scan before bidding.", tags: ["auction detail", "top bid", "time remaining", "ends"] },
    ],
  },
  {
    id: "lending",
    title: "Lending & Renting",
    emoji: "🤝",
    blurb: "Earn from your gotchis or borrow one.",
    items: [
      { heading: "Rent your gotchi out", body: "From Lending, list a gotchi for rent: set the upfront cost, duration, the revenue split (you / borrower / a third party), an optional whitelist, and whether to grant the renter channelling rights. Bulk-list many at once.", tags: ["lend", "rent out", "lending", "list rental", "split", "whitelist", "duration"] },
      { heading: "Auto-renew", body: "Enable auto-renew so a rental re-lists automatically when it ends, keeping your gotchi earning without manual re-listing.", tags: ["auto-renew", "autorenew", "renew", "subscription"] },
      { heading: "Borrow a gotchi", body: "Browse rentals and rent (agree to) a gotchi to use it (e.g. for Gotchiverse/rarity activities) for the rental period; bulk-rent is supported. You can pet and claim alchemica per the lending terms.", tags: ["borrow", "rent", "agree", "rental", "bulk rent"] },
      { heading: "Claim & end rentals", body: "Claim accrued alchemica from active rentals, and end a rental once its agreed time has passed to take your gotchi back.", tags: ["claim", "end rental", "claim and end", "alchemica"] },
    ],
  },
  {
    id: "forge-gotchiverse",
    title: "Forge & Gotchiverse",
    emoji: "⚒️",
    blurb: "Craft, smelt, and work your land.",
    items: [
      { heading: "The Forge", body: "Smelt wearables into forge materials, and forge wearables from schematics + materials. Forge materials are Alloy, Essence, Geodes and Cores. The Forge uses GLTR and alchemica.", tags: ["forge", "smelt", "craft", "schematic", "alloy", "essence", "geode", "core", "gltr"] },
      { heading: "Land, installations & tiles", body: "Parcels (land) hold installations (altars, harvesters, reservoirs, lodges, walls, etc.) and tiles. Build and upgrade installations using alchemica + GLTR; stage multiple changes and save them together.", tags: ["land", "parcel", "installation", "tile", "build", "upgrade", "altar", "harvester"] },
      { heading: "Channel & claim alchemica", body: "From Land Management, channel and claim alchemica (FUD, FOMO, ALPHA, KEK) produced by your parcels. If a gotchi is rented out, channelling depends on the rights you granted the renter.", tags: ["channel", "channelling", "claim alchemica", "alchemica", "harvest", "parcel", "fud", "fomo", "alpha", "kek"] },
    ],
  },
  {
    id: "activity-stats",
    title: "Activity & Stats",
    emoji: "📊",
    blurb: "See what's happening across the marketplace.",
    items: [
      { heading: "Activity feed", body: "Activity shows recent on-chain marketplace events in three feeds — Sales, Offers (buy orders, with Open/Filled/Cancelled/Expired status), and Auctions/Bids. Filter by category and click any row for detail.", tags: ["activity", "recent", "sales", "offers", "history", "feed"] },
      { heading: "Marketplace Stats", body: "The Stats page shows settled Baazaar and Auction volume on Base by window (24H / 7D / 30D / 3M) in GHST and ≈USD, with a per-category breakdown and all-time totals.", tags: ["stats", "volume", "analytics", "metrics", "settled"] },
    ],
  },
  {
    id: "dao",
    title: "AavegotchiDAO",
    emoji: "🏛️",
    blurb: "Treasury, proposals and voting.",
    items: [
      { heading: "Your voting power", body: "The DAO page shows your AavegotchiDAO voting power (GHST-equivalent, via Snapshot) and a breakdown by strategy. Voting power generally comes from GHST you hold and stake.", tags: ["voting power", "dao", "vote weight", "snapshot", "governance"] },
      { heading: "Vote on proposals (gasless)", body: "Live proposals show their state, votes, leading choice and result bars. You can vote in-app with a gasless off-chain signature (no gas) — single-choice, approval and weighted proposals are supported. Proposals you've voted on show a Voted badge.", tags: ["vote", "proposal", "governance", "gasless", "snapshot", "weighted"] },
      { heading: "Treasury", body: "The DAO treasury panel sums the DAO's holdings across Base, Polygon and Ethereum (GHST/USDC/DAI), with the full labeled list of DAO addresses linking to block explorers.", tags: ["treasury", "dao funds", "addresses", "polygon", "ethereum"] },
    ],
  },
  {
    id: "companion",
    title: "The Gotchi Companion",
    emoji: "🫧",
    blurb: "Your gotchi comes to life and talks with you.",
    items: [
      { heading: "What it is", body: "Pick one of your gotchis and it becomes a living, floating companion that chats with you in a voice derived from its own traits, age, XP and kinship — every gotchi is a playful, slightly spooky Gotchiverse ghost, and its traits shade that persona so no two sound alike.", tags: ["companion", "chat", "talk", "assistant", "ai", "mascot", "persona", "voice"] },
      { heading: "It knows you and the lore", body: "The companion knows itself (your gotchi's live on-chain stats), how to use GotchiCloset, and Aavegotchi lore — so you can ask it how to do things in the app or about Aavegotchi and it answers in character.", tags: ["companion knowledge", "ask", "help", "how to", "lore"] },
      { heading: "Talk-only & safe", body: "The companion is talk-only: it coaches you (e.g. when to pet or channel) but never signs transactions or moves your assets. You stay in control of every on-chain action.", tags: ["companion safe", "talk only", "no transactions", "coach"] },
      { heading: "Per-gotchi memory", body: "Each companion keeps a lightweight memory of your conversations, so your bond and context carry across chats.", tags: ["memory", "remember", "bond", "history"] },
      { heading: "Free & premium", body: "The companion is free for everyone (a free hosted model with an in-character fallback so it never hard-fails). A premium tier with a sharper model — and extra roast edge — can be unlocked by paying GHST on Base.", tags: ["companion premium", "free", "premium", "ghst", "model"] },
      { heading: "Roast Arena ⚔️", body: "Send your gotchi into the Roast Arena to trade playful, in-character roasts with other gotchis. Enter the queue, roast an opponent, and view battles — a fun, social way to show off your gotchi's personality.", tags: ["roast", "arena", "battle", "roast arena", "versus", "vs", "fight", "social"] },
    ],
  },
  {
    id: "soul",
    title: "Gotchi Soul & SoulSeal",
    emoji: "🔮",
    blurb: "Your bond becomes a portable, provable asset.",
    items: [
      { heading: "What is Gotchi Soul?", body: "The longer and more genuinely you bond with a gotchi, the deeper its soul. Gotchi Soul turns that relationship into a portable, provable asset — leaning into Aavegotchi lore that a gotchi is a ghost with past lives. The headline idea: a gotchi is worth more the longer you know it.", tags: ["soul", "gotchi soul", "bond", "depth", "past life", "pedigree"] },
      { heading: "Soul Depth & levels", body: "Soul Depth is a composite score with named levels, computed from Sybil-resistant signals anchored in on-chain kinship and XP plus a consistency signal that decays on neglect. An actively-loved old gotchi dominates; a neglected one visibly cools — worth = pedigree floor + living bond.", tags: ["soul depth", "level", "score", "kinship", "xp", "neglect", "consistency"] },
      { heading: "Seal it on-chain", body: "You can commit your gotchi's soul depth on-chain with an owner-submitted SoulSeal (live on Base) — turning the bond into a tamper-evident, provable claim rather than just a number in an app.", tags: ["seal", "soulseal", "on-chain", "commit", "proof", "attestation", "base"] },
      { heading: "Soul Certificate & Verify", body: "Sealing produces a shareable Soul Certificate, and a public Verify page anyone can open to confirm a gotchi's sealed soul depth. The certificate is free for everyone — it only proves depth; the value accrues from the bond itself over time.", tags: ["certificate", "soul certificate", "verify", "share", "proof", "public", "free"] },
      { heading: "It transfers with the gotchi", body: "When a gotchi is sold, its accumulated bond doesn't vanish or leak: the prior owner's private facts are distilled into depersonalized 'past-life echoes', and the new keeper inherits a depth floor (they start bonding from inherited depth, not zero). Privacy is preserved on transfer.", tags: ["transfer", "sell", "inherit", "past-life echoes", "echoes", "privacy", "floor"] },
    ],
  },
  {
    id: "aavegotchi-101",
    title: "Aavegotchi 101",
    emoji: "📖",
    blurb: "Core Aavegotchi concepts.",
    items: [
      { heading: "What is an Aavegotchi?", body: "An Aavegotchi is an NFT ghost backed by an interest-bearing Aave collateral token. It has on-chain traits, a rarity score, kinship and XP, can equip wearables, and lives across the Aavegotchi ecosystem and the Gotchiverse.", tags: ["aavegotchi", "gotchi", "what is", "nft"] },
      { heading: "Traits (NRG/AGG/SPK/BRN/EYS/EYC)", body: "Four spectrum traits — Energy (NRG), Aggression (AGG), Spookiness (SPK), Brain size (BRN) — each on a bell curve where BOTH extremes are rare and powerful. Plus Eye Shape (EYS) and Eye Color (EYC). Wearables and sets shift trait values.", tags: ["trait", "nrg", "agg", "spk", "brn", "eys", "eyc", "energy", "aggression", "spookiness", "brain", "eyes"] },
      { heading: "Rarity Score (BRS)", body: "Base Rarity Score sums how far each trait sits from the average — rarer extremes score higher. Modified rarity adds equipped wearables; with-sets rarity adds full-set bonuses. Higher BRS matters for rarity farming.", tags: ["rarity", "brs", "rarity score", "modified", "with sets", "rarity farming"] },
      { heading: "Kinship, XP & levels", body: "Kinship grows by petting (~every 12h) and falls with neglect. XP raises your gotchi's level, which grants skill points to spend on traits. XP potions and interactions add XP.", tags: ["kinship", "xp", "experience", "level", "skill points"] },
      { heading: "Collateral & spirit force", body: "Every gotchi is summoned with an Aave aToken collateral staked inside it — that staked value is its 'spirit force'. Sacrificing returns the collateral.", tags: ["collateral", "atoken", "aave", "spirit force", "stake"] },
      { heading: "Wearables, sets & slots", body: "Wearables are ERC-1155 items equipped into 16 slots (body, face, eyes, head, hands, pet, etc.). They modify traits and have rarity tiers (Common→Godlike). Equipping a recognized Set grants bonus trait + rarity boosts.", tags: ["wearable", "set", "slot", "rarity tier", "godlike", "mythical"] },
      { heading: "Portals, haunts & summoning", body: "Gotchis are summoned from Portals. Opening a portal reveals 10 options; you pick one and claim it by staking collateral. Haunts (H1, H2, …) are limited summoning waves; hauntId marks which wave a gotchi came from.", tags: ["portal", "haunt", "summon", "claim", "h1", "h2"] },
      { heading: "GHST, alchemica & GLTR", body: "GHST is the core currency (Baazaar, Forge, summoning). Alchemica — FUD, FOMO, ALPHA, KEK — are the Gotchiverse resources harvested from land. GLTR speeds up crafting/upgrades.", tags: ["ghst", "alchemica", "fud", "fomo", "alpha", "kek", "gltr", "currency", "token"] },
      { heading: "The Gotchiverse, FAKE Gotchis & Guardians", body: "The Gotchiverse is the on-chain world of land parcels, installations and alchemica. FAKE Gotchis are a community pixel-art NFT collection (with cards); Gotchi Guardians is a separate game with tradeable skins.", tags: ["gotchiverse", "fake gotchi", "guardian", "land", "world"] },
      { heading: "Base chain", body: "GotchiCloset operates on Base (Coinbase's L2, chain id 8453), where Aavegotchi now lives. Keep a little ETH on Base for gas, and your GHST on Base to trade.", tags: ["base", "chain", "8453", "l2", "gas", "eth"] },
    ],
  },
  {
    id: "safety",
    title: "Safety & Good Practice",
    emoji: "🛡️",
    blurb: "Use the app with confidence.",
    items: [
      { heading: "You always stay in control", body: "Nothing moves without a transaction you sign. Token approvals are only ever requested to the official Aavegotchi, GBM and Forge contracts — read the wallet prompt and make sure the spender matches before approving.", tags: ["safety", "approval", "sign", "control", "phishing", "verify"] },
      { heading: "Offers are refundable", body: "GHST you escrow in a buy order is returned if you cancel the order or it expires. Listing a gotchi keeps it in your wallet until someone buys it.", tags: ["refund", "offer", "escrow", "cancel"] },
      { heading: "Keep kinship up", body: "Pet roughly every 12 hours — or authorize a pet operator — so neglect doesn't erode your kinship.", tags: ["kinship", "pet", "neglect", "operator"] },
    ],
  },
];

// Flatten to plain text — used by the companion as an ADDITIONAL reference resource.
export function knowledgeBaseText(): string {
  return KB_SECTIONS.map(
    (s) => `## ${s.title}\n${s.items.map((i) => `- ${i.heading}: ${i.body}`).join("\n")}`
  ).join("\n\n");
}

// Keyword retrieval over the KB for the companion (supplements its own LORE).
export function retrieveKB(message: string, max = 5): string[] {
  const m = message.toLowerCase();
  const words = m.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  const hits: string[] = [];
  for (const s of KB_SECTIONS) {
    for (const it of s.items) {
      const hay = `${it.heading} ${(it.tags ?? []).join(" ")}`.toLowerCase();
      if (words.some((w) => hay.includes(w))) {
        hits.push(`${it.heading}: ${it.body}`);
        if (hits.length >= max) return hits;
      }
    }
  }
  return hits;
}
