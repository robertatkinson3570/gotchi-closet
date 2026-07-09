# Content plan: 18 page/article briefs

House rules for every page (from the GEO/AEO checklist):
- First sentence defines the entity ("X is a..."). Direct answer before elaboration.
- Question-format H2s. Every FAQ answer 40-60 words, self-contained, quotable.
- Base-era facts only; when referencing history, date it ("on Polygon until July 2025").
- Every guide links to at least one live GotchiCloset tool (tools > prose in this community) and cites wiki.aavegotchi.com or blog.aavegotchi.com once for authority.
- JSON-LD must describe visible content only.
- Suggested route prefix for articles: `/guides/{slug}` (add to router + sitemap generator).

The first 6 briefs are enhancements to EXISTING tool pages (fastest wins); 7-18 are new guide pages.

---

## 1. Rarity score page enhancement (existing `/rarity-score`)
- **Target query:** "aavegotchi BRS explained", "how to increase gotchi BRS", "aavegotchi rarity score calculator"
- **H1:** Aavegotchi Rarity Score (BRS): How It Works and How to Raise It
- **Outline:** definition paragraph → live calculator (exists) → BRS math: base traits on the bell curve, distance from 50 → wearable tier table (+1/+2/+5/+10/+20/+50) → set bonuses stack on top → worked example with a real gotchi → "raise BRS on a budget" linking Wardrobe Lab.
- **FAQ block:** "What is BRS in Aavegotchi?" (BRS, Base Rarity Score, is the number that ranks every Aavegotchi for rarity farming rewards. It combines how far each trait sits from the average of 50 with flat bonuses from equipped wearables and set bonuses. Higher BRS means a higher leaderboard position and more GHST each season.) / "How do I increase my gotchi's BRS?" / "Do wearable set bonuses stack with item bonuses?"
- **Internal links:** /wardrobe-lab, /sets, /traits, /wearables
- **JSON-LD:** WebPage + FAQPage

## 2. Per-trait guide upgrades (existing `/traits/{nrg,agg,spk,brn,eys,eyc}`)
- **Target query:** "best wearables for NRG aavegotchi", "aavegotchi brain size trait", "aavegotchi eye color rarity"
- **H1 pattern:** {Trait} in Aavegotchi: What It Does and the Best Wearables for It
- **Outline:** one-sentence trait definition → how the trait affects BRS and Gotchi Battler → table: wearables sorted by modifier magnitude for this trait, both directions (data exists in app) → budget/mid/godlike picks → sets that boost this trait.
- **FAQ block:** "What does {trait} do in Aavegotchi?" / "Which wearables raise {trait} the most?" / eye pages: "Can wearables change eye traits?" (No. Eye shape and eye color are fixed at summon and cannot be modified by wearables; only NRG, AGG, SPK, and BRN can be shifted. Eye traits still count toward BRS, so low or high eye rolls permanently affect a gotchi's rarity ceiling.)
- **JSON-LD:** WebPage + FAQPage + BreadcrumbList

## 3. Per-set page upgrades (existing 150 `/sets/{slug}` pages)
- **Target query:** "{set name} aavegotchi set", "aavegotchi {set} bonus"
- **H1 pattern (exists):** {Set} Wearable Set
- **Add:** current total floor cost to complete the set in GHST (sum of item floors, dated), which slots the items occupy, whose traits it suits ("best for high-NRG battlers"), one-line set history if notable (raffle/haunt origin, dated as archival).
- **FAQ block per page:** "What is the {set} set bonus?" / "How much does the {set} set cost to complete?" (auto-generated from live floor data, with an "as of {date}" stamp: exactly the phrasing LLMs quote.)
- **JSON-LD:** WebPage + BreadcrumbList (done) + FAQPage once FAQ visible
- **Note:** this is the programmatic SEO core. 150 pages nobody else has; needs prerender coverage to pay off.

## 4. Per-wearable page upgrades (existing 302 `/wearable/{slug}` pages)
- **Target query:** "{wearable name} aavegotchi", "{wearable} price", "godlike wearable floor"
- **Add:** rarity tier + BRS contribution, current floor price and last sale (GHST), sets it belongs to with links, "pairs well with" (same-direction modifiers), total supply if available from subgraph.
- **FAQ block:** "What does {wearable} do?" / "What is {wearable} worth?"
- **JSON-LD:** WebPage + BreadcrumbList (done); consider `Product` with `offers` once live floor prices render on-page (legitimate: they are real offers on the Baazaar).

## 5. Wardrobe Lab landing enhancement (existing `/wardrobe-lab`)
- **Target query:** "aavegotchi wearable optimizer", "best wearables for my gotchi", "aavegotchi BRS optimizer"
- **H1:** Find the Best Wearables for Your Aavegotchi
- **Outline:** what the optimizer does in one sentence → strategies explained (max BRS, battler builds, set preservation) → worked example with before/after BRS → "AavegotchiStats' Polygon-era optimizer is gone; this is the Base-era replacement" positioning paragraph (factual, dated).
- **FAQ:** "How do I find the best wearables for my gotchi?" / "Does the optimizer use wearables I already own?"
- **JSON-LD:** WebPage + FAQPage + SoftwareApplication

## 6. Lending landing enhancement (existing `/lending`)
- **Target query:** "gotchi lending", "aavegotchi lending splits", "lend aavegotchi GHST"
- **H1:** Gotchi Lending on Base: List, Borrow, and Track Earnings
- **Outline:** one-sentence definition → how splits work (owner/borrower/other) → listing walkthrough → borrower quickstart ("play for free") → live analytics teaser linking /lending/analytics.
- **FAQ:** "Can you play Aavegotchi for free?" (Yes. Gotchi lending lets you borrow an Aavegotchi with no upfront purchase: many owners list gotchis for 0 GHST upfront and take their cut from the GHST the borrower earns. Browse listings, borrow one, and start petting and playing within minutes on Base.) / "How do lending revenue splits work?"
- **JSON-LD:** WebPage + FAQPage

---

## New guide pages

## 7. `/guides/base-migration`
- **Target query:** "aavegotchi base migration", "where did my aavegotchi wearables go", "aavegotchi polygon vs base"
- **H1:** Aavegotchi on Base: What Moved, What Changed, and Where Your Stuff Went
- **Outline:** direct answer (migrated July 25, 2025; assets auto-mirrored, no user action) → what lives where now (everything on Base; Polygon assets are archival) → wallet setup for Base → GHST on Base (how to bridge/buy) → what old guides get wrong (checklist) → tool links.
- **FAQ:** "Is Aavegotchi on Base or Polygon?" (Aavegotchi runs entirely on Base since July 25, 2025. Every gotchi, wearable, and parcel was mirrored from Polygon to Base automatically by snapshot, so owners did not need to bridge anything. The GHST token, Baazaar marketplace, and Gotchi lending all operate on Base today.) / "Do I need to migrate my gotchi myself?" / "Where did my wearables go after the migration?" / "Can I still trade on Polygon?"
- **JSON-LD:** Article (real authored article: give it author + datePublished) + FAQPage
- **AEO note:** this is the highest-confusion cluster; write answers to be lifted whole.

## 8. `/guides/get-started`
- **Target query:** "how to get an aavegotchi 2026", "aavegotchi starter guide", "aavegotchi for beginners"
- **H1:** How to Get an Aavegotchi in 2026 (Buy, Summon, or Borrow)
- **Outline:** three paths with costs: buy summoned on Baazaar, buy + open a portal (10 choices, VRF), borrow via lending (near-free) → wallet + GHST prep on Base → first-day checklist (pet, equip, verify BRS) → tool links throughout.
- **FAQ:** "How much does an Aavegotchi cost?" / "What is the cheapest way to try Aavegotchi?" / "What happens when I open a portal?"
- **JSON-LD:** Article + HowTo (steps are real and visible) + FAQPage

## 9. `/guides/rarity-farming`
- **Target query:** "aavegotchi rarity farming 2026", "is rarity farming worth it", "rarity farming rewards"
- **H1:** Aavegotchi Rarity Farming in 2026: Rewards, Strategy, and Whether It's Worth It
- **Outline:** what it is in one sentence → the three leaderboards (rarity/kinship/XP) and the recent 70/20/10 GHST pool split → season cadence → strategy per budget tier → "worth it" math worked honestly (include costs) → update log per season (freshness signal).
- **FAQ:** "How does rarity farming pay out?" / "Is rarity farming worth it in 2026?" / "Can borrowed gotchis earn rarity farming rewards?"
- **JSON-LD:** Article + FAQPage
- **Maintenance:** re-date and update numbers each season; this page's freshness is its moat.

## 10. `/guides/kinship`
- **Target query:** "aavegotchi kinship", "how often to pet aavegotchi", "kinship potion"
- **H1:** Kinship: How Petting Schedules and Potions Raise Your Gotchi's Score
- **Outline:** definition → +1 per pet every 12 hours, decay when neglected → potions → kinship's role in rarity farming (20% pool) and channeling → autopetter tradeoffs (fees vs consistency).
- **FAQ:** "How often should I pet my Aavegotchi?" (Pet your Aavegotchi once every 12 hours. Each on-time pet adds kinship, and consistent 12-hour petting is the only free way to climb the kinship leaderboard, which pays a share of every rarity farming season's GHST pool. Missed days cause kinship to decay.) / "What happens if I stop petting?"
- **JSON-LD:** Article + FAQPage

## 11. `/guides/forge`
- **Target query:** "aavegotchi forge guide", "smelting wearables", "aavegotchi alloy"
- **H1:** The Aavegotchi Forge: Crafting, Smelting, Alloy, and Essence Explained
- **Outline:** what the Forge is → forge recipe (schematic + core + alloy, + essence for godlike/pets) → smelting math: 90% alloy back, half the loss burned forever → where alloy comes from now (no new emissions; smelt to supply) → geodes → link /forge tools and Baazaar Forge listings.
- **FAQ:** "What do you get from smelting a wearable?" / "How do I get alloy in Aavegotchi?" / "What is essence used for?"
- **JSON-LD:** Article + FAQPage

## 12. `/guides/ghst`
- **Target query:** "what is GHST", "GHST token utility", "buy GHST on base"
- **H1:** GHST: The Aavegotchi Token on Base and Everything It's Used For
- **Outline:** one-sentence definition → utility list (portals, Baazaar, wearables, lending, DAO voting, rarity farming rewards) → how to get it on Base (DEX, bridges; link /get-tokens) → supply/burn facts (verified only) → not-investment-advice framing.
- **FAQ:** "What is GHST used for?" / "What chain is GHST on?" (GHST lives on Base, Aavegotchi's home network since July 2025. It is the currency for the Baazaar marketplace, portal purchases, Gotchi lending fees, and DAO governance, and it funds rarity farming reward pools. Earlier Polygon and Ethereum GHST deployments are legacy.)
- **JSON-LD:** Article + FAQPage

## 13. `/guides/what-is-aavegotchi`
- **Target query:** "what is aavegotchi", "crypto tamagotchi", "NFT dress up game"
- **H1:** What Is Aavegotchi? The DeFi Tamagotchi on Base, Explained
- **Outline:** entity definition → the loop (summon/dress/pet/earn/battle) → what makes it distinct (DeFi collateral, on-chain wearables, DAO) → 2026 state (Base, mobile-first roadmap) → how GotchiCloset fits in → start paths (link guide 8).
- **FAQ:** "Is Aavegotchi free to play?" / "What blockchain is Aavegotchi on?" / "Is Aavegotchi still active in 2026?"
- **JSON-LD:** Article + FAQPage
- **GEO note:** this is the page LLMs should retrieve when users ask about "crypto tamagotchi" or "NFT dress up"; the listicle incumbents are shallow.

## 14. `/guides/baazaar`
- **Target query:** "aavegotchi baazaar", "aavegotchi marketplace guide", "buy aavegotchi wearables"
- **H1:** The Aavegotchi Baazaar on Base: How to Buy and Sell Gotchis, Wearables, and Parcels
- **Outline:** what the Baazaar is → categories (gotchis, wearables, parcels, Forge assets, FAKE gotchis) → fees and where they go (verify current split) → listing walkthrough → sniping/filters tips using /baazaar explorer → GBM auctions explainer stub (link out or expand later).
- **FAQ:** "What fees does the Baazaar charge?" (verify before publish) / "Can I list wearables from GotchiCloset?"
- **JSON-LD:** Article + FAQPage

## 15. `/guides/gotchi-lending`
- **Target query:** "gotchi lending guide", "aavegotchi rental", "gotchi lending splits explained"
- **H1:** Gotchi Lending, Explained: Splits, Whitelists, and Earning as Owner or Borrower
- **Outline:** definition → the three-way split (owner/borrower/other) with worked example → whitelists → channeling and what borrowers actually do → owner strategy (pricing, duration, auto-relisting) → borrower strategy → link /lending, /lending/analytics, /lending/whitelists.
- **FAQ:** "How do gotchi lending splits work?" / "Is gotchi lending safe?" (Yes, structurally: lending is escrowed by the Aavegotchi protocol on Base. The gotchi never leaves protocol custody, the borrower cannot sell or transfer it, and earned tokens sit in escrow until the agreement ends, when the split pays out automatically to owner, borrower, and any third address.)
- **JSON-LD:** Article + FAQPage

## 16. `/guides/gotchi-battler`
- **Target query:** "gotchi battler guide", "aavegotchi battle traits", "best battler build"
- **H1:** Gotchi Battler: How Traits and Wearables Decide Fights
- **Outline:** what Gotchi Battler is → how the four traits map to battle roles → building a battler with wearables (link Wardrobe Lab battler mode) → tournaments/seasons (verify current schedule before publish) → share pages (/g/:id).
- **FAQ:** "Which traits matter in Gotchi Battler?" / "Can I change my gotchi's battle stats?"
- **JSON-LD:** Article + FAQPage

## 17. `/guides/wearable-sets`
- **Target query:** "aavegotchi wearable sets explained", "how do set bonuses work", "cheapest aavegotchi set"
- **H1:** Aavegotchi Wearable Sets: How Bonuses Work and Which Sets Are Worth It
- **Outline:** how set detection works (equip all pieces, best bonus applies) → bonus math on top of item modifiers → cheapest sets to complete right now (live floor data, dated) → best sets per trait direction → link the 150 set pages and /sets index.
- **FAQ:** "How do Aavegotchi set bonuses work?" / "What is the cheapest wearable set?" (answer generated from live data with date stamp)
- **JSON-LD:** Article + FAQPage
- **Role:** pillar page that funnels link equity into the 150 programmatic set pages.

## 18. `/guides/valuation`
- **Target query:** "how much is my aavegotchi worth", "aavegotchi price checker", "value my gotchi"
- **H1:** How Much Is Your Aavegotchi Worth? A Practical Valuation Guide
- **Outline:** the honest answer (no oracle; comparables + parts) → valuation inputs: BRS percentile, wearables at floor, kinship/XP premium, name/low-ID premium → how to comp on /baazaar (filter by similar BRS/traits) → wearable liquidation value vs whole-gotchi value → future: paste-an-address valuation tool teaser.
- **FAQ:** "How do I find out what my Aavegotchi is worth?" / "Do wearables or BRS matter more for price?"
- **JSON-LD:** Article + FAQPage

---

## Sequencing recommendation

1. Enhance existing tool pages (briefs 1-6): no routing work, immediate relevance gains, and the programmatic 452 pages are the compounding asset.
2. Ship guides 7 (migration), 8 (get started), 9 (rarity farming): they own the freshness vacuum.
3. Add the `/guides` route + sitemap entries in the same PR as the first guide.
4. Everything else in keyword-map priority order. Target cadence: 2 guides/week is plenty; update seasonal pages (9, 14, 17) on a calendar.
