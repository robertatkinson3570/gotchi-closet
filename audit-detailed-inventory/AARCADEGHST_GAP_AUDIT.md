# AarcadeGh$t (aarcadeghst.com) vs GotchiCloset — feature gap audit

Audited: 2026-07-02 (Playwright walk of every public route, plus the site's own "Full site map" doc page).
AarcadeGh$t is userdefault's retro 2D hub for Aavegotchi on Base — recreation of the old aavegotchi.com dapp plus arcade games and a DAO governance suite.

## Site map (theirs)

Player: `/`, `/play` (tile grid), `/games`, `/games/:id`, `/manuals/:id`, `/leaderboard` (arcade scores), `/settings` (sound/music), `/about`.
Wallet: `/myaavegotchis`, `/myportals`, `/myland`, `/myitems`.
Market/DeFi: `/baazaar`, `/auction` (GBM), `/fakegotchis`, `/lending`, `/stake` (GLTR pools), `/gax` (Aerodrome swap), `/raffle` (FRENS Prize Savings), `/real-estate` (Citaadel map).
DAO: `/dao` hub, `/dao/overview` (org chart, ecosystem map, ops registry), `/dao/forum` (Discourse + Lens), `/dao/proposals` (Snapshot), `/dao/voting-power`, `/dao/quorum`, `/dao/accounting` (public ledger), `/dao/docs` (GitBook-style guide), elections modal, `/dao/hackathon/*` (ideas via Lens, leaderboard, Juicebox funding, treasury, submission portal).
Concierge (whitelist-gated): `/concierge`, `/transfers`, `/lending-tool` (+activity/lands/export), `/aarcade-petter` (pet-operator delegation + petting history), petting-bot embed.
Profiles: `/player/:id` (wallet or username).
Global: support chat widget ("Chat with us"), chiptune music player, GHST price ticker with 24h change in footer, light/dark mode.

## GAPS — things AarcadeGh$t has that GotchiCloset does not

### Meaningful
1. **Playable arcade games** — Paarcel and Gotchinopoly pixel games, full-screen game viewer, per-game manuals (`/manuals/:gameId`), and a game-score leaderboard (all-time / this-week, per game). GotchiCloset has the arena battle sim but no playable games.
2. **GLTR staking pools** — GHST-FUD/FOMO/ALPHA/KEK/WETH/GLTR LP pools with live staked totals, GLTR/block, pool weight, your stake/rewards, claim.
3. **FRENS Prize Savings raffle** — deposit/withdraw FRENS, next-raffle countdown, prizes on Base.
4. **In-app token swap (GAX)** — embedded Aerodrome swap on Base. GotchiCloset's `/get-tokens` only links out to CowSwap/Aerodrome/Uniswap/bridges.
5. **Citaadel real-estate map** — interactive map of all 30,058 parcels: color by Baazaar price / GBM price / listed status / district / size, filter by owner/parcel ID/name/listings, districts + roads overlay, box-select, map/list/split views, live owner + installation data.
6. **DAO governance suite depth** — GotchiCloset's `/dao` has quorum, multi-chain treasury, Snapshot stats; AarcadeGh$t adds:
   - Forum integration (Discourse + Lens topics) in-app
   - Governance org chart (roles, permissions, compensation transparency) + ecosystem map + 29-system operations registry
   - Public double-entry accounting ledger (chart of accounts, AP/AR/aging, USD reports, Safe tx sync)
   - Stewardship elections module (candidates, voting)
   - Hackathon program hub: Lens idea board with 500-like signal gate, WIP leaderboard, Juicebox per-project funding treasuries, submission/judging portal, resources
7. **Public player profiles with usernames** — `/player/:id` resolves wallet OR username; "My profile" concept. GotchiCloset has `/u/:address` activity only.
8. **Dedicated batch gotchi transfer page** — `/transfers`. GotchiCloset can transfer per-gotchi from the actions panel but has no bulk transfer UI.
9. **Support chat widget + Aarcade AI Bot** — persistent "Chat with us" bubble; community AI assistant.
10. **On-site docs/guide system** — GitBook-style editable guide with chapters and full site map (`/dao/docs`).

### Cosmetic / retro flavor
11. **Chiptune music player** + sound settings page (volume controls).
12. **GHST price ticker with 24h % change** persistent in the footer.
13. **Retro "Play hub" tile grid** replicating the old aavegotchi.com landing (Merch link, etc.).
14. **Wallet-connected home layout** — three-column nav homepage when connected.

## NOT gaps (GotchiCloset already has, often deeper)

- Baazaar browsing: closet's explorer covers gotchis/wearables/items/parcels/installations/tiles/portals/FAKE gotchis/FAKE cards/forge/**guardian skins**/auctions — Aarcade has no guardian skins and its gotchi listing detail is a bare buy modal (no traits); closet has trait/BRS filters and full detail.
- Buying + GBM bidding (useMarketplaceBuy, AuctionGrid, GotchiActionsPanel).
- Portal opening + summoning (PortalsPanel: openPortals/claimAavegotchi).
- Lending: closet has marketplace + analytics + my-lendings + bulk list + whitelists + land management; Aarcade's lending page still shows stale Polygon-era banner copy.
- Auto-petting: closet's steward relayer petting ≈ Aarcade's pet-operator delegation. (Aarcade shows a per-gotchi petting history log — minor idea to borrow.)
- Kinship/XP leaderboard, portfolio floor value, stats, dress-up/wardrobe lab, sets/traits/rarity encyclopedia, forge page, Soul/SoulSeal, companion — none of these exist on Aarcade.

## Notable implementation details observed
- Their GBM auction page had 3 live gotchi auctions with bid UI; auction collections sidebar mirrors baazaar categories.
- FAKE Gotchis page: Queue / Explore / Mint tabs, publisher multi-select filter, total volume + owner counts.
- Petter address: `0x9b23dB04457D9aF944858681331E40da8c91981F` (EIP pet-operator delegation, no transfer).
- DAO accounting shows ~$2.8k YTD spend — relevant datapoint for the Stewardship/Great Freeze cost argument.
