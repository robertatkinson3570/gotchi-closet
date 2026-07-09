# Dapp vs GotchiCloset parity sweep, 2026-07-09

Scope: baazaar wearables/portals/consumables/parcels/installations/tiles/fakegotchis/fakecards/guardian-skins (cards + detail modals), /activity bids + offers tabs, public user profile /u/, auction STATS tab, lending surface. All dapp pages loaded with `?chainId=8453`. Every field below was read from live DOM text (headless Playwright, plugin browser bridge was down). Excluded (covered by the earlier session): auction detail modals, global activity feed, baazaar forge + aavegotchis list pages.

Note: the profile address given in the brief (`0xe0d4...A3c`) is 39 hex chars, invalid. Dapp renders "Asset not found"; closet renders a graceful empty activity state. Real comparisons below use `0xcafbfd974eb21d0ebd6a05ef8858f5ca2c9f9e39` (an active seller pulled from dapp recent-sales links).

---

## 1. Wearables

### Dapp `/baazaar/wearables`
List card: name, slot badge (BODY/HEAD/EYES/FACE/HANDS/HANDRIGHT/PET), trait boost chips (+3, -1...), PRICE, `SOLD (12 D AGO)` + last sold price, quantity badge on multi-listings. Sort: Listed (new/old), Price, Rarity, TokenID. Filters: Category (Aavegotchi/Gotchiverse/FAKE/Guardians), Price, Slot, Rarity Type, Themes & Sets, Trait Boost.

Detail modal (URL gains `?id=6008`): 3D/2D preview toggle; Owner link; name + listing #; PRICE (688.00); FLOOR (688.00); SOLD (12 D AGO) 300.00; HIGHEST OFFER (NONE); BUY FOR with currency selector GHST / USDC / ETH; WEARABLE DETAILS: RARITY, SLOT, TRAIT BOOST, QUANTITY; RECENT SALES table (SELLER, PRICE, TIME, ~20 rows spanning years).

### Closet `/explorer?asset=wearable`
Catalog of ALL wearables (not only listed): name, rarity tier, slot, trait modifiers (e.g. `BRN +1`), `#id • BRS +n`, Offer button; modes All / Owned / Baazaar; filters Slot, Rarity, Trait Modifiers, Sets (149), Quality/Meta; sort Rarity. Detail modal (deep-links to `?asset=wearable&id=228`): name #id, Rarity, Slot, BRS, per-trait NRG/AGG/SPK/BRN values, Make Offer, **Top holders** (rank / owner / balance), **Currently worn by** (gotchi ids + recency, "+10 more"), **Recent sales** (seller / price / when, 15 rows).

### Gaps (dapp has, closet lacks), by impact
1. Modal has no market context: no current cheapest listing, no FLOOR, no last-sold price/date, no HIGHEST OFFER, no Buy button (Offer only).
2. No multi-currency buy (GHST/USDC/ETH).
3. No QUANTITY (total supply) in details.
4. No 3D preview toggle.
5. Catalog cards show no floor/listing price in All mode (dapp cards always show price + last sold).

### Closet does better (do not regress)
- Full catalog incl. unlisted wearables; dapp only shows live listings.
- Top holders table and Currently worn by list (dapp has neither).
- Per-trait modifier breakdown + BRS on the card and modal.
- Shareable deep links (`?asset=wearable&id=`).

---

## 2. Portals

### Dapp `/baazaar/portals`
List card: `Closed Portal` / `Opened Portal`, #id, H1/H2 badge, `TOP RARITY: 510` (opened only), PRICE, SOLD (ago) + price, including Polygon-era sales (`SOLD (5 YR AGO) 3000`). Filters: Category, Price, Portal Type, Haunt. Modal (`?id=3089`): RECENT SALES (seller/price/time); Owner; CLOSED PORTAL #2227; description text ("This is a brand new portal. Be the first one to open it! One of ten Aavegotchis are waiting to be picked."); PRICE; SOLD (5 MO AGO) 400.00; BUY FOR GHST/USDC/ETH; PORTAL DETAILS: HAUNT.

### Closet `/explorer?asset=portal`
"13 of 13" count; cards: #id, Closed/Open Portal, H1/H2, `Top rarity: 510` (open), `Sold 5mo ago · 400 GHST` or `Never sold`, price, Buy, Offer. Filters: Token ID, Min/Max GHST; sorts.

### Gaps
1. **Sale-history data bug-level gap**: closet says "Never sold" for portals the dapp shows as sold years ago on Polygon (#117, #2109, #177, #399, #11335, #19205). Closet only has Base-era sales.
2. No detail modal at all (card click does nothing; verified URL/content unchanged).
3. No Portal Type / Haunt filters.
4. No description text, no recent-sales table, no owner.

### Closet better
- Result count ("13 of 13"); Buy + Offer directly on card (dapp needs the modal).

---

## 3. Consumables

### Dapp `/baazaar/consumables`
List card: name (XP Potion / Greater XP Potion), #128/#129, boost chip (`+20 XP` / `+50 XP`), PRICE, SOLD (4 MO AGO) + price, qty badge. Filters: Potion Boost & Size, Rarity Type. Modal: Owner; name #129; PRICE 90.00; FLOOR 77.00; SOLD (4 MO AGO) 99.00; HIGHEST OFFER NONE; BUY FOR GHST/USDC/ETH; CONSUMABLE DETAILS: RARITY (RARE), BOOST (+50 XP), QUANTITY; **CHEAPER LISTINGS** section (4, listing cards inline); RECENT SALES (seller/price/time, ~20 rows).

### Closet `/explorer?asset=item`
"4 of 4"; cards show only `#129`, `×4` qty, price, Buy, Offer. No name, no boost, no rarity, no art label, no last-sold. Filters: Token ID, Min/Max GHST only.

### Gaps
1. Item NAME and boost/rarity missing on cards (buyer sees bare `#129`). Highest per-surface UX gap in the sweep.
2. No detail modal (no floor, cheaper listings, recent sales, owner).
3. No last-sold on cards.

---

## 4. Parcels (baazaar listings, not auctions)

### Dapp `/baazaar/parcels`
List card: parcel name, #id, `DISTRICT: 4`, size (HUMBLE/REASONABLE/SPACIOUS), two count chips = installations count and tiles count (e.g. `133` / `0`), PRICE, SOLD (ago) + price incl. Polygon-era. Filters: Category, Price, Size, District. Modal (`?id=3158`): RECENT SALES (seller 0x993c...685e, price, time); Owner; ART-GIVES-METHOD (27937); PRICE 299.00; SOLD (5 YR AGO) 1,490.00; BUY FOR GHST/USDC/ETH; PARCEL DETAILS: DISTRICT 4, SIZE SPACIOUS, INSTALLATIONS 133, TILES 0, SURVEY ROUND 10, AALTAR LEVEL 8; ALCHEMICA BOOST (FUD/FOMO/ALPHA/KEK); ALCHEMICA SURVEY (FUD 814,860.72 / FOMO 580,336.99 / ALPHA 232,296.70 / KEK 80,462.76); ALCHEMICA CLAIMED (per token); INSTALLATIONS ON THIS PARCEL (named list: "ALCHEMICAL AALTAR LEVEL 8").

### Closet `/explorer?asset=parcel`
"114 of 114"; cards: #id, name, `Dist 4 · Spacious (V)`, price, Buy, Offer. Filters: Token ID, Min/Max GHST, Size (incl. Spacious V/H + Partner), District (populated list). **Listings / Citaadel Map** view toggle. No detail modal (verified click does nothing).

### Gaps
1. No parcel detail modal: aaltar level, survey round, alchemica survey/claimed/boost, installations list are the core parcel-valuation data and are absent.
2. No installations/tiles counts on cards.
3. No last-sold (and no Polygon-era history) on cards.
4. No recent-sales table / owner.

### Closet better
- Citaadel Map view of listings (dapp baazaar has no map).
- Spacious split into V/H + Partner size filter (dapp has one SPACIOUS bucket on cards).
- Result count; on-card Buy/Offer.

---

## 5. Installations & Tiles

### Dapp `/baazaar/installations`
Card: name (incl. rarity prefix, e.g. "Rare Laava Lamp"), #id, `LEVEL: n`, PRICE, SOLD (ago) + price, qty badge. Filters: Category, Price, Installation Type, Rarity Type, Level.

### Dapp `/baazaar/tiles`
Card: qty badge, name, #id, PRICE, SOLD (ago) + price. Filters: Category, Price, Tile Style.

### Closet `?asset=installation` / `?asset=tile`
Installations: "83 of 83"; `#id ×qty`, name, price, Buy, Offer; filters ID or name, Min/Max GHST, Type (Altar / NFT Display / Decoration), Level (1/2). Tiles: "112 of 112"; `#id ×qty`, name, price, Buy, Offer; Type filter renders a single unlabeled "Type 0" option.

### Gaps
1. No last-sold price/date on any card.
2. No detail modal (no recent sales, owner, floor).
3. No rarity filter for installations.
4. Tile "Type 0" filter is broken/unlabeled (shows raw value).

### Closet better
- Name search ("ID or name") on installations; dapp has none.
- Type taxonomy (Altar/NFT Display/Decoration) is friendlier than dapp's "Installation Type" list (unverified contents).

---

## 6. FAKE Gotchis, FAKE Cards, Guardian Skins

### Dapp `/baazaar/fakegotchis`
Card: artwork name, `BY: <ARTIST>`, PRICE, SOLD (ago)/NEVER. Filters: Artists, Publishers. Modal: Owner; name; description text; "View @fakegotchis.com" link; PRICE; FLOOR; SOLD; HIGHEST OFFER; BUY FOR GHST/USDC/ETH; FAKEGOTCHI DETAILS: ARTIST, PUBLISHER, EDITIONS (100), HOLDERS (56), ISSUANCE (4 YR AGO).

### Dapp `/baazaar/fakecards`
Card: "FAKE Gotchis Card", PRICE, SOLD (3 MO AGO) + price, qty badge. Filters: Category, Price.

### Dapp `/baazaar/guardian-skins`
Card: qty badge, skin name (Ghost Pirate, Cupid Aarcher...), GOTCHI GUARDIANS tag, PRICE, SOLD (ago) + price. Filters: Category only (no Price section rendered).

### Closet `?asset=fakegotchi` / `?asset=fakecard` / `?asset=guardian`
FAKE Gotchis: "107 of 107"; #tokenId, name, `by <artist>`, Never sold / sold line, price, Buy, Offer. FAKE Cards: "4 of 4"; cards are bare `#0` (+ qty) + price, no name. Guardian Skins: "14 of 14"; `#id ×qty`, name, price, Buy, Offer.

### Gaps
1. FAKE Card cards labeled `#0` with no name (dapp shows "FAKE Gotchis Card") and no last-sold.
2. No fakegotchi modal: description, editions, holders, issuance date, floor, highest offer, fakegotchis.com link.
3. No Artists / Publishers filters.
4. Guardian skins: no last-sold on cards, no modal.

### Closet better
- FAKE Gotchi cards show the tokenId (dapp cards do not).
- Guardian skins show token id + explicit qty.

---

## 7. Activity: BIDS and OFFERS tabs (`/activity?p=bids`, `?p=offers`)

Dapp BIDS table: ITEM (name + tokenId), PRICE, BIDDER (avatar/link column), STATUS (icon: observed ✅, 🟨, 🟩), TIME ("17 hours ago"). Category filter. Mixes gotchi and wearable bids.

Dapp OFFERS table: ITEM (name + id, incl. schematics/essence/cores/fake cards), PRICE, QUANTITY, BY (buyer, e.g. `pg.gotchi`), STATUS (`⌛️ Open` / `✅ Sold`), TIME. Offer filters are wallet-gated ("CONNECT WALLET TO SEE OFFER FILTERS").

Closet equivalent: per-wallet Bids / Offers made / Offers received tabs on `/u/<addr>` (see 8). A global cross-market bids feed and a global open-offers feed were not seen on the closet (global activity page itself was audited in the earlier session).

Gap: global GBM bids feed and global offers feed with status; dapp also resolves bidder/buyer names (`pg.gotchi`).

---

## 8. Public user profile

### Dapp `/u/<addr>` (`/inventory?itemType=all`)
Header: avatar, short address, title ("No Title"), FOLLOWERS / FOLLOWING counts + FOLLOW button, LEVEL + `0/0 PTS`. Tabs: PROFILE, INVENTORY, GAMES, BADGES, TOKENS, ACTIVITY, AIRDROPS, LENDINGS.
- INVENTORY: filters All / Available / On Sale; sort Name/TokenID; category counts (AAVEGOTCHI 16 gotchis + 74 wearables, GOTCHIVERSE 29, FAKE GOTCHIS 1); gotchi cards with name, #id, haunt, collateral ticker (aUSDC, amDAI...), `NOW (LAST PET 5 MONTHS AGO)`, `LISTED FOR 2500 GHST` badge, `2X MYTH` badge; wearable cards with slot + trait chips + LISTED FOR badges + qty; parcels with DIST + size; FAKE GOTCHI MINTING item.
- ACTIVITY: categories ALL / PURCHASES / SALES / OFFERS / BIDS / AUCTIONS / LENDINGS (empty state: "You haven't purchased any at the moment!").
- LENDINGS: owner-side batch manager: sort Id/Name/Brs/Kinship; SELECT ALL / SELECT NONE / BATCH LENDING; buckets Available For Listing / Cancelable Listings / Ongoing Listings / Claimable Lendings (counts); table ITEM / BRS / NAKED BRS / KINSHIP / ID.

### Closet `/u/<addr>`
"Activity · 0xcafb…9e39" + **View assets** link. Tabs: Listings, Offers made, Offers received, Auctions, Bids, Purchases, Sales, **Earnings**. Category filter (All/Gotchi/Wearable/Item/Parcel/Tile/Installation). Table: Type / Item / Price / Status / When (e.g. `Wearable #87 · 180 GHST · Listed · 11d ago`, `×4` quantities). Footer hint: "Cancelling an offer refunds your escrowed GHST. Auction claim settles an ended auction...".

### Gaps
1. No inventory browse on the profile itself (dapp shows the wallet's gotchis/wearables/parcels with listed-for badges, last-pet, collateral); closet only links out via View assets.
2. Activity rows show bare `#87` ids, no item names or thumbnails in text.
3. No airdrops tab on the public profile (dapp has AIRDROPS; closet's new AirdropsPanel is explorer-side).
4. No batch-lending manager view (NAKED BRS, cancelable/claimable buckets).
5. Social layer (followers/level/badges/games/tokens) absent; low impact for a trading tool.

### Closet better
- Earnings tab (dapp has nothing equivalent).
- Offers received vs made split; Listings tab with live status.
- Full address shown; invalid addresses fail gracefully (dapp shows "Asset not found").

---

## 9. Auction STATS tab (`/auction?status=stats`)

Dapp tabs: LIVE, UPCOMING, WATCHLIST, ACTIVITY, STATS. STATS shows a card list of finished auctions, not aggregates: item (name + slot/trait chips, or `BY: <artist>` for fakes, gotchi #id + haunt + collateral), incentive tier chip (LOW / MEDIUM / HIGH), status (CLAIMED / CANCELLED / ENDED), and a GHST amount (incentives earned, matching the "Incentives" filter). Sort: Ends/Price/Created/TokenID. Filters: Category, Incentives.

Closet: explorer Auctions tab (previous session's scope). No incentives-history view, no WATCHLIST, no UPCOMING tab seen on the closet.

Gaps: auction incentives history (tier + earned + claim status), watchlist, upcoming-auctions list.

---

## 10. Lending

Dapp: **no public lending marketplace.** `/lending` renders "404 Error." The Play And Earn menu contains only GAME CENTER, RARITY FARMING, STAKING. Lending exists solely as the owner-side LENDINGS tab on profiles (batch listing manager, section 8) plus a LENDINGS category in profile activity.

Closet `/lending`: full public market. "59 of 59 listings"; CSV export; Mine; Analytics; sort Newest/Price/BRS/Duration/Level/Kinship; filters: Haunt (1-4), BRS w/ wearables buckets (<500 ... 700+), duration buckets (≤1d ... >31d), min duration (days/hours), upfront price range, whitelist (any/open/whitelisted/rentable by me), whitelist ID, channelling (all/allowed/disabled), min borrower split %, min kinship. Cards: CH + WL badges, BRS, gotchi name, #id, haunt, KIN, LVL, all six traits, upfront GHST, duration, split `B 70% / L 30%`, GHST/day rate, Open tag.

Closet is strictly ahead here. Only dapp-side item worth copying: the batch lend/cancel/claim buckets with NAKED BRS in one management table.

---

## Cross-cutting patterns

Dapp modal formula repeated on every category: Owner link, PRICE, FLOOR, last SOLD (with age), HIGHEST OFFER, BUY FOR with GHST/USDC/ETH, category-specific DETAILS block, RECENT SALES table, sometimes CHEAPER LISTINGS. The closet has an equivalent modal only for wearables (and gotchis); every other market grid (item/parcel/portal/installation/tile/fakegotchi/fakecard/guardian) is card-only.

Dapp list-card formula: name + last-sold price with age on every card, across all categories. Closet cards show last-sold only for portals/fakegotchis (Base era only).

## Top gaps ranked
1. No detail modals for 8 of 10 closet market categories (parcels and consumables hurt most).
2. Consumable/FAKE-card cards are bare token ids, no names/boosts/rarity.
3. Polygon-era sale history missing ("Never sold" shown for items the dapp shows sold 4-5 yrs ago).
4. No floor / cheaper-listings / highest-offer context anywhere on the closet.
5. Parcel valuation data (aaltar level, survey round, alchemica survey/claimed, installations list, counts on cards).
6. No last-sold on most closet cards.
7. No multi-currency buy (USDC/ETH).
8. No global bids/offers feeds (per-wallet only).
9. No profile inventory view with listed-for/last-pet badges.
10. FakeGotchi metadata + artist/publisher filters (editions, holders, issuance).
11. Auction incentives stats / watchlist / upcoming.
12. No 3D wearable preview.
13. Portal/haunt/rarity filter parity misses; tile "Type 0" broken label.
14. Batch lending manager (NAKED BRS, claimable buckets).
15. Social profile layer (followers/level/badges), lowest priority.

## Closet advantages to protect
- `/lending` public marketplace + analytics + CSV (dapp has zero public lending).
- Wearables: full catalog, top holders, currently-worn-by, per-trait detail, deep links.
- Citaadel Map view for parcel listings.
- On-card Buy/Offer everywhere; result counts ("N of N"); name search on installations.
- /u Earnings tab and offers made/received split; graceful error states; full addresses.
- Gotchi grid depth (RAR + naked BRS, KIN, LVL, soul status, sealed badge, eye rarity 1/N).
