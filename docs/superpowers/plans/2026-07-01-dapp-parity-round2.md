# Dapp Parity Round 2 — Auctions/Activity/Portals/FAKE Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring GotchiCloset's Explorer Auctions tab, Activity page, Portals tab and FAKE Gotchis tab to full detail parity with dapp.aavegotchi.com, verified by live Playwright e2e specs that compare against the dapp.

**Architecture:** One new pure lib (`itemMeta.ts`) resolves any ERC1155 type id → name/slot/trait-modifiers/rarity from local `data/wearables.json` (sync) merged with the core subgraph's `itemTypes` (cached async, covers consumables). AuctionGrid, ActivityPage and MarketGrid consume it. Portal/FAKE enrichment uses the core subgraph `portals` / `fakeGotchiNFTTokens` entities (verified live 2026-07-01). All UI stays in the existing surfaces per the 2026-06-18 parity overview (no new routes).

**Tech Stack:** React + TanStack Query + Goldsky subgraphs (`aavegotchi-core-base`, `aavegotchi-gbm-baazaar-base`), vitest for unit, Playwright live suite for parity verification.

---

## Verified data facts (queried live 2026-07-01, don't re-derive)

- GBM subgraph live auctions right now: 4 × erc721 on aavegotchiDiamond (gotchis), 14 × erc1155 on **wearableDiamond `0x052e6c114a166B0e91C2340370d72D4C33752B4b`**. `AuctionGrid.tsx` doesn't recognize the wearableDiamond → cards render as bare `#id` with a gavel fallback. That is the user-reported "auctions tab not showing wearables".
- GBM `Auction` entity also has: `presetId`, `dueIncentives`, `incMin`, `incMax`, `category`, `totalBidsVolume`, `buyNowPrice`, `isBought` (introspected).
- Core subgraph active `erc721Listings` by category: `{0: 11 closed portals, 2: 2 OPEN portals, 3: 191 gotchis, 4: 114 parcels, 5: 108 FAKEs}`. The Explorer Portals tab only queries category 0 → the 2 open-portal listings are invisible today.
- `ERC1155Purchase` entity exists: `listingID, category, erc1155TypeId, seller, buyer, recipient, priceInWei, quantity, timeLastPurchased` → gives per-purchase buyer for Activity sales (dapp shows FROM and TO; we currently show seller only).
- `Portal` entity: `hauntId, status, options, openedAt, activeListing, historicalPrices`. `FakeGotchiNFTToken`: `identifier, name, artistName, publisherName, editions, thumbnailHash`.
- `data/wearables.json` (302 entries) covers every currently-auctioned wearable id but NOT consumables (126–129 absent) → remote `itemTypes` merge is required for consumables.
- Dapp card vocabulary to match: auction card = name, slot chip, trait-modifier chips, incentives tier, countdown `5D:19H:05M`, current bid; activity row = image, NAME, #id, slot+modifiers, haunt/collateral for gotchis, "TOP RARITY: n" for opened portals, qty, price, from, to, time ago; portal card = "Closed/Opened Portal", H1/H2, top rarity, last-sold; FAKE card = name, "BY: artist", last-sold.

## File map

- Create: `src/lib/explorer/itemMeta.ts` — id → {name, slot, modifiers, rarity, category} + `RARITY_COLORS`
- Create: `tests/itemMeta.test.ts` — unit tests for the above
- Modify: `src/components/explorer/AuctionGrid.tsx` — contract recognition, card/modal enrichment, incentives, upcoming section, filter chips + sort + search, watchlist
- Modify: `src/pages/ActivityPage.tsx` — names/slots/rarity, gotchi name+haunt+collateral, expanded categories, search, 1155 buyer via `erc1155Purchases`, richer modal
- Modify: `src/components/explorer/MarketGrid.tsx` — portals cat 0+2, closed/open + haunt + top-rarity badges, FAKE name/artist, last-sold lines
- Modify: `src/components/explorer/WearableExplorerCard.tsx` — import shared `RARITY_COLORS` (delete local copy)
- Create: `tests/e2e/live/auctions-parity.spec.ts`, `tests/e2e/live/activity-parity.spec.ts`, `tests/e2e/live/explorer-collections-parity.spec.ts`

---

### Task 1: itemMeta lib (TDD)

**Files:** Create `src/lib/explorer/itemMeta.ts`, Create `tests/itemMeta.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/itemMeta.test.ts`). Before writing assertions, print ground truth once: `node -e "const w=require('./data/wearables.json');console.log(JSON.stringify(w.find(x=>x.id===110)))"` and use those exact values.

```ts
import { describe, it, expect } from "vitest";
import { itemMetaSync, formatModifiers, RARITY_COLORS } from "@/lib/explorer/itemMeta";

describe("itemMetaSync", () => {
  it("resolves a known wearable (Jamaican Flag #110)", () => {
    const m = itemMetaSync(110)!;
    expect(m.name).toBe("Jamaican Flag");
    expect(m.rarity).toBe("Rare"); // rarityScoreModifier 5
    expect(m.slot).toMatch(/Hand/);
  });
  it("formats trait modifiers with sign and key", () => {
    const m = itemMetaSync(110)!;
    expect(m.modifiers.length).toBeGreaterThan(0);
    expect(m.modifiers.every((s) => /^(NRG|AGG|SPK|BRN|EYS|EYC) [+-]\d+$/.test(s))).toBe(true);
  });
  it("returns undefined for unknown ids (consumables come from remote merge)", () => {
    expect(itemMetaSync(126)).toBeUndefined();
  });
  it("exposes a color for every rarity tier", () => {
    for (const t of ["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Godlike"]) {
      expect(RARITY_COLORS[t]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/itemMeta.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `src/lib/explorer/itemMeta.ts`.**

```ts
import wearablesData from "../../../data/wearables.json";
import { CORE_SUBGRAPH } from "@/lib/subgraph";
import { getWearableRarityTier, getWearableSlots } from "./wearableTypes";

export type ItemMeta = {
  id: number;
  name: string;
  slot: string | null;      // first equippable slot label, null = no slot (consumable)
  modifiers: string[];      // e.g. ["NRG -1", "AGG -2"] — only non-zero
  rarity: string | null;    // tier name; null for consumables (itemType category 2)
  category: number;         // itemType category: 0 wearable, 2 consumable
};

const SLOT_LABELS = ["Body", "Face", "Eyes", "Head", "Hand L", "Hand R", "Pet", "BG"];
const TRAIT_KEYS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

// Canonical rarity tint (moved from WearableExplorerCard so auctions/activity share it).
export const RARITY_COLORS: Record<string, string> = {
  Godlike: "text-cyan-400",
  Mythical: "text-pink-400",
  Legendary: "text-yellow-400",
  Rare: "text-blue-400",
  Uncommon: "text-emerald-400",
  Common: "text-purple-300",
};

export function formatModifiers(traitModifiers: unknown[]): string[] {
  return (traitModifiers ?? [])
    .map((v, i) => ({ v: Number(v) || 0, k: TRAIT_KEYS[i] }))
    .filter((x) => x.v !== 0 && x.k)
    .map((x) => `${x.k} ${x.v > 0 ? "+" : ""}${x.v}`);
}

function toMeta(raw: any): ItemMeta {
  const cat = Number(raw.category) || 0;
  const slots = getWearableSlots((raw.slotPositions ?? []).map(Boolean));
  return {
    id: Number(raw.id),
    name: raw.name || `#${raw.id}`,
    slot: slots.length > 0 ? SLOT_LABELS[slots[0]] ?? null : null,
    modifiers: formatModifiers(raw.traitModifiers ?? []),
    rarity: cat === 0 ? getWearableRarityTier(Number(raw.rarityScoreModifier) || 0) : null,
    category: cat,
  };
}

const localMeta = new Map<number, ItemMeta>(
  (wearablesData as any[]).map((w) => [Number(w.id), toMeta(w)])
);

/** Synchronous lookup from the bundled wearables db (covers all 302 wearables). */
export function itemMetaSync(id: number | string): ItemMeta | undefined {
  return localMeta.get(Number(id));
}

let remote: Promise<Map<number, ItemMeta>> | null = null;
/** Local db merged with subgraph itemTypes (adds consumables); cached for the session. */
export function fetchItemMetaMap(): Promise<Map<number, ItemMeta>> {
  if (!remote) {
    remote = (async () => {
      const map = new Map(localMeta);
      try {
        const res = await fetch(CORE_SUBGRAPH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{ itemTypes(first: 1000) { id name category rarityScoreModifier traitModifiers slotPositions } }`,
          }),
        });
        const json = await res.json();
        for (const it of json?.data?.itemTypes ?? []) {
          const meta = toMeta(it);
          if (meta.name && !meta.name.startsWith("#")) map.set(meta.id, meta);
        }
      } catch {
        /* offline → bundled data only */
      }
      return map;
    })();
  }
  return remote;
}
```

Check `getWearableRarityTier` / `getWearableSlots` signatures in `src/lib/explorer/wearableTypes.ts:108-119` before wiring — adjust the call if the real signature differs.

- [ ] **Step 4: Run tests.** `pnpm vitest run tests/itemMeta.test.ts` → PASS. If slot label assertion fails, print `itemMetaSync(110)` and align the expectation with the real slotPositions data (NOT the code).
- [ ] **Step 5: DRY — swap WearableExplorerCard to the shared map.** In `src/components/explorer/WearableExplorerCard.tsx` delete the local `RARITY_COLORS` (line ~23) and `import { RARITY_COLORS } from "@/lib/explorer/itemMeta";`. Keep the exact same color values in itemMeta as the card had (read the card's full map first and copy it verbatim — the values above are from the card).
- [ ] **Step 6: Typecheck + commit.** `pnpm typecheck` → clean. `git add -A && git commit -m "feat(explorer): shared itemMeta lib for 1155 name/slot/rarity resolution"`.

### Task 2: AuctionGrid — wearable/forge/FAKE recognition + card & modal detail

**Files:** Modify `src/components/explorer/AuctionGrid.tsx`

- [ ] **Step 1: Extend the auction query + type.** Add `presetId dueIncentives` to the `fetchAuctions` GraphQL field list and to `type Auction` (`presetId: string; dueIncentives: string;`), mapping in the `.map()` (`presetId: a.presetId ?? "0", dueIncentives: a.dueIncentives ?? "0"`). Same for `fetchClaimable`'s `map()` (use "0" defaults).
- [ ] **Step 2: Recognize the missing contracts.** Import `WEARABLE_DIAMOND_BASE, FORGE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE` from contracts. Replace `assetLabel` body:

```ts
function assetLabel(a: Auction): string {
  const c = a.contract;
  if (c === REALM_DIAMOND_BASE.toLowerCase()) return "Parcel";
  if (c === INSTALLATION_DIAMOND_BASE.toLowerCase()) return "Installation";
  if (c === TILE_DIAMOND_BASE.toLowerCase()) return "Tile";
  if (c === WEARABLE_DIAMOND_BASE.toLowerCase()) return "Wearable";
  if (c === FORGE_DIAMOND_BASE.toLowerCase()) return "Forge Item";
  if (c === FAKE_GOTCHIS_NFT_BASE.toLowerCase()) return "FAKE Gotchi";
  if (c === AAVEGOTCHI_DIAMOND_BASE.toLowerCase()) return a.type === "erc1155" ? "Consumable" : "Aavegotchi";
  return "NFT";
}
```

In `AuctionItemImage`, before the final fallback add: wearableDiamond OR forgeDiamond OR (aavegotchiDiamond && erc1155) → `<AssetImage candidates={itemImageCandidates(a.tokenId)} …/>` (forge schematics share wearable ids so item art resolves; cores/essence fall through AssetImage's own fallback). Keep `FakeGotchiImage` only for `FAKE_GOTCHIS_NFT_BASE` and unknown contracts.

- [ ] **Step 3: Enrich 1155 cards.** Add a helper component inside the file:

```tsx
function ItemMetaLine({ tokenId }: { tokenId: string }) {
  const { data: metaMap } = useQuery({ queryKey: ["item-meta-map"], queryFn: fetchItemMetaMap, staleTime: Infinity });
  const m = metaMap?.get(Number(tokenId)) ?? itemMetaSync(tokenId);
  if (!m) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold truncate" title={m.name}>{m.name}</div>
      <div className="text-[9px] text-muted-foreground flex items-center gap-1 flex-wrap">
        {m.rarity && <span className={`font-semibold ${RARITY_COLORS[m.rarity] ?? ""}`}>{m.rarity}</span>}
        {m.slot && <span>· {m.slot}</span>}
        {m.modifiers.length > 0 && <span>· {m.modifiers.join(" ")}</span>}
      </div>
    </div>
  );
}
```

Render it on every card where `a.type === "erc1155"`; place directly under the image, mirroring the gotchi stat block. Show `×{a.quantity}` next to `#{a.tokenId}` when `Number(a.quantity) > 1`. Add an incentives chip when `BigInt(a.dueIncentives || "0") > 0n`: `<span title="GBM bid-to-earn: outbid bidders earn incentives" className="text-[9px] px-1 rounded bg-fuchsia-500/15 text-fuchsia-400">🎁 incentives</span>`.

- [ ] **Step 4: Modal detail.** In `AuctionDetailModal`, for non-gotchi 1155 auctions render `<ItemMetaLine tokenId={a.tokenId} />` under the image plus a `Quantity ×n` row when > 1, and use the resolved name in the modal title (`{itemMetaSync(a.tokenId)?.name ?? assetLabel(a)} #${a.tokenId}` for 1155s on known item contracts).
- [ ] **Step 5: Upcoming section.** `rows` currently drops `startsAt > nowSec` silently. Compute `const upcoming = (data ?? []).filter((a) => a.startsAt > nowSec);` and render a collapsed "Upcoming ({n})" section under the live grid using the same card (countdown label "Starts in …" via `countdown(a.startsAt - nowSec)`, bid button hidden).
- [ ] **Step 6: Typecheck + visual check + commit.** `pnpm typecheck`; `pnpm dev` then Playwright one-shot dump of `http://localhost:5000/explorer` Auctions tab (reuse the session deepdive script) → every wearable auction card must show its name. Commit: `feat(auctions): wearable/forge/FAKE auction cards with name, slot, modifiers, rarity, incentives + upcoming section`.

### Task 3: AuctionGrid — filters, sort, search, watchlist

**Files:** Modify `src/components/explorer/AuctionGrid.tsx`

- [ ] **Step 1: State + derivation.** Add `const [typeFilter, setTypeFilter] = useState("all"); const [sortBy, setSortBy] = useState("ends-asc"); const [search, setSearch] = useState(""); const [watchOnly, setWatchOnly] = useState(false);` and a localStorage-backed watchlist:

```ts
const WATCH_KEY = "gc-auction-watchlist";
function loadWatchlist(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]")); } catch { return new Set(); }
}
```

(store back on toggle with `localStorage.setItem(WATCH_KEY, JSON.stringify([...next]))`).

- [ ] **Step 2: Filter groups.** Map contract → group key: gotchi (aavegotchiDiamond erc721), wearable (wearableDiamond OR aavegotchiDiamond erc1155), parcel, installation, tile, other. Chips row above the grid: `All · Gotchis · Wearables · Parcels · Installations · Tiles · Other · ★ Watchlist`, each with a live count; hide zero-count chips except All. Search input (`placeholder="Search name or #id"`) matches tokenId or `itemMetaSync(tokenId)?.name` (case-insensitive) or gotchi name from `gotchiInfo`.
- [ ] **Step 3: Sort select** with options: `ends-asc` "Ends soonest" (default, current behavior), `ends-desc`, `bid-desc` "Top bid ↑", `bid-asc`, `newest` (by `startsAt` desc). Apply filter → search → sort in the `rows` useMemo.
- [ ] **Step 4: Watch star.** Small `☆/★` toggle button top-right of each card (stopPropagation), amber when watched.
- [ ] **Step 5: Typecheck + commit.** `pnpm typecheck`; commit `feat(auctions): type filters, sort, search, watchlist parity with dapp auction page`.

### Task 4: ActivityPage — item detail parity

**Files:** Modify `src/pages/ActivityPage.tsx`

- [ ] **Step 1: Names for 1155 + portals/forge labels.** Load the meta map once in `ActivityPage` (`useQuery({ queryKey: ["item-meta-map"], queryFn: fetchItemMetaMap, staleTime: Infinity })`) and pass down. Replace `catLabel` with a kind-aware version adding: erc721 cat 0 → "Closed Portal", cat 2 → "Open Portal", cat 5 → "FAKE Gotchi"; erc1155 cat 2 → "Consumable", 6 → "FAKE Card", 7 → "Alloy", 8 → "Essence", 9 → "Geode", 11 → "Core", 12 → "Guardian Skin".
- [ ] **Step 2: Row Item cell.** For erc1155 rows show `{meta.name}` (rarity-colored) with `#id ×qty` beneath; keep bare `#id` fallback when no meta. For gotchi rows show gotchi name + `#id`.
- [ ] **Step 3: Gotchi enrichment.** Extend `enrichGotchiArt`'s query with `name` and store `gotchiName`, and render H{hauntId} + name. Type change: add `gotchiName?: string` to `Row`.
- [ ] **Step 4: 1155 sales buyer.** In `fetchSales`, replace the `erc1155Listings(where:{sold:true})` query with:

```graphql
erc1155Purchases(first: 100, orderBy: timeLastPurchased, orderDirection: desc) {
  id category erc1155TypeId quantity priceInWei seller buyer recipient timeLastPurchased
}
```

mapping `to: l.recipient || l.buyer`. Seller→Buyer column now renders for wearable sales like the dapp.

- [ ] **Step 5: Search + expanded category filters.** Add a search input (name / #id / 0xaddress prefix) filtering rows client-side. Expand `CATEGORY_FILTERS` to: All, Gotchis, Portals (erc721 0+2), Wearables (1155 cat 0), Consumables (1155 cat 2), Parcels, Installations, Tiles, Forge (7,8,9,11), FAKE (721 cat 5 + 1155 cat 6). Filters must match on `(kind, category)` pairs, not bare category numbers (REALM/INSTALLATION collide at 4) — implement as a predicate per filter entry: `{ key, label, match: (r: Row) => boolean }`.
- [ ] **Step 6: Detail modal.** Header uses resolved name (`{name} · #{id}`); add rows Slot / Modifiers / Rarity when meta exists; "Open in Explorer" link for wearables → `/explorer?tab=wearables` (check `ExplorerPage` for the actual tab query-param name first; if none exists, link to `/wearables` index page instead); gotchi title links to `/gotchi/:tokenId`.
- [ ] **Step 7: Typecheck + visual check + commit.** `pnpm typecheck`; dump `http://localhost:5000/activity` (all 3 feeds) — wearable rows must show names; sales rows must show buyer. Commit `feat(activity): item names, slots, rarity, gotchi/haunt detail, buyer for 1155 sales, expanded filters + search`.

### Task 5: MarketGrid — portals (open+closed) & FAKE enrichment

**Files:** Modify `src/components/explorer/MarketGrid.tsx`, `src/pages/ExplorerPage.tsx` (portal tab call site)

- [ ] **Step 1: Include open portals.** In `fetchListings`, when the caller is the portal tab, fetch categories 0 AND 2. Change `category: number` to accept `number | number[]` and build `category_in: [${list}]` when array; find the `<MarketGrid` call with `itemKind="portal"` in `ExplorerPage.tsx` and pass `[0, 2]`. Card label: `l.category === 2 ? "Open Portal" : "Closed Portal"`.
- [ ] **Step 2: Portal enrichment.** New query keyed on the listed portal ids:

```graphql
{ portals(first: 200, where: { id_in: [...] }) { id hauntId status options { baseRarityScore } } }
```

Badge `H{hauntId}` on every portal card; for status `"Opened"` (or category 2) show `Top rarity: {max(options.baseRarityScore)}` like the dapp. Introspect the `options` field with one live query first; if `options` errors, drop only the top-rarity line (keep H badge) and note it in the commit body.

- [ ] **Step 3: FAKE names/artists.** For `itemKind === "fakegotchi"`, batch query:

```graphql
{ fakeGotchiNFTTokens(first: 1000, where: { identifier_in: [...] }) { identifier name artistName editions } }
```

Card: name line (truncate, title attr) + `BY: {artistName}` mini-line. Detail modal: name in title + artist + editions row.

- [ ] **Step 4: Last-sold lines.** One batched query per grid load for portal + FAKE tabs: `erc721Listings(first: 1000, where: { tokenId_in: [...], timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc) { tokenId priceInWei timePurchased }`; keep the newest per tokenId; render `Last sold {ago} · {ghst} GHST` on the card footer and in the detail modal, `Never sold` otherwise (dapp shows "SOLD NEVER").
- [ ] **Step 5: Typecheck + visual + commit.** `pnpm typecheck`; dump Portals + FAKE tabs → 13 portal cards (11 closed + 2 open, matching subgraph), FAKE cards show names/artists. Commit `feat(explorer): open-portal listings + portal/FAKE card detail parity (haunt, top rarity, artist, last sold)`.

### Task 6: Full verification (r2r)

**Files:** Create `tests/e2e/live/auctions-parity.spec.ts`, `tests/e2e/live/activity-parity.spec.ts`, `tests/e2e/live/explorer-collections-parity.spec.ts`

- [ ] **Step 1: Auctions parity spec.**

```ts
import { test, expect } from "@playwright/test";
import wearables from "../../../data/wearables.json";

const GBM = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn";

async function liveWearableAuctions(): Promise<{ tokenId: string }[]> {
  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(GBM, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ auctions(first: 500, where: { cancelled: false, claimed: false, endsAt_gt: "${now}", contractAddress: "0x052e6c114a166b0e91c2340370d72d4c33752b4b" }) { tokenId startsAt } }` }),
  });
  const j = await res.json();
  return (j.data?.auctions ?? []).filter((a: any) => Number(a.startsAt) <= now);
}

test("every live wearable auction shows its wearable name", async ({ page }) => {
  const live = await liveWearableAuctions();
  test.skip(live.length === 0, "no live wearable auctions right now");
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Auctions" }).click();
  await page.waitForLoadState("networkidle");
  const byId = new Map(wearables.map((w: any) => [Number(w.id), w.name]));
  for (const a of live.slice(0, 10)) {
    const name = byId.get(Number(a.tokenId));
    expect(name, `wearable ${a.tokenId} missing from local db`).toBeTruthy();
    await expect(page.getByText(name!, { exact: false }).first()).toBeVisible({ timeout: 20000 });
  }
});

test("auction card names match the dapp's live wearable auction names", async ({ page, context }) => {
  const live = await liveWearableAuctions();
  test.skip(live.length === 0, "no live wearable auctions right now");
  const dapp = await context.newPage();
  await dapp.goto("https://dapp.aavegotchi.com/auction?status=live&itemType=wearables", { waitUntil: "networkidle" });
  await dapp.waitForTimeout(3000);
  const dappText = (await dapp.locator("body").innerText()).toUpperCase();
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Auctions" }).click();
  await page.waitForTimeout(3000);
  const ourText = (await page.locator("main").innerText()).toUpperCase();
  const byId = new Map(wearables.map((w: any) => [Number(w.id), w.name]));
  let checked = 0;
  for (const a of live) {
    const name = byId.get(Number(a.tokenId))?.toUpperCase();
    if (!name || !dappText.includes(name)) continue; // dapp page may paginate
    expect(ourText, `dapp shows "${name}" but we don't`).toContain(name);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Activity parity spec** (same shape): `/activity` → Auctions feed shows wearable names (assert first live wearable auction's name visible, not just `#id`); Sales feed rows for 1155 purchases show a buyer (query `erc1155Purchases(first:1)` for ground truth and assert its buyer short-address appears); Offers feed unchanged smoke (rows render).
- [ ] **Step 3: Collections parity spec:** portals tab count equals subgraph active cat-0+2 listing count and an `Open Portal` card exists when cat-2 listings exist; FAKE tab first 5 cards show the subgraph `name` for their `identifier`.
- [ ] **Step 4: Unit + typecheck + build.** `pnpm test:unit && pnpm typecheck && pnpm build` → all green.
- [ ] **Step 5: Default e2e suite.** `pnpm test:e2e` → green (fix any fallout before proceeding).
- [ ] **Step 6: Live suite.** `pnpm test:e2e:live` (starts dev server at :5000) → new parity specs pass against live data + live dapp. Pre-existing live-spec flake unrelated to these changes: note, don't chase.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "test(e2e): live parity specs vs dapp for auctions, activity, portals and FAKE collections"`.

## Self-review checklist (run after Task 6)

1. Every user-named gap covered? Auctions-wearables (T2), activity detail (T4), plus discovered gaps: open portals invisible (T5), FAKE anonymity (T5), upcoming auctions hidden (T2).
2. No placeholder steps; all queries verified against live schema introspection this session.
3. Names consistent: `itemMetaSync` / `fetchItemMetaMap` / `RARITY_COLORS` / `ItemMetaLine` used identically across tasks.
