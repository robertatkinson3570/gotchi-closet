# Marketplace Stats — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build
**Project:** gotchi-closet
**Reference:** `2026-06-18-dapp-parity-overview.md`

---

## 1. Summary

The dapp's `/stats` page is a marketplace volume dashboard: settled **Baazaar** and
**Auctions** volume, selectable by chain and time window (24H / 7D / 30D / 3M), shown
in GHST and ~ USD, plus sales counts. We have no analytics surface. This is cheap — we
already query the same subgraphs.

Observed on dapp (Base, 2026-06-18): "Marketplace Volume Overview", chain selector,
24H/7D/30D/3M tabs, Baazaar + Auctions volume cards (e.g. Auctions 24H ~ 48.8K GHST ~
$2.8K), "total settled volume recorded on-chain".

---

## 2. Placement

A **new `/stats` route** is the intuitive home (matches the dapp; users expect a
dedicated analytics page) — but link it from the existing Activity page header (Sales /
Offers / Auctions / **Stats**) so it's discoverable without new nav. Reuse Activity's
data layer.

---

## 3. Data (verified sources)

- **Baazaar settled volume**: `aavegotchi-core-base` — sum `priceInWei` over
  `erc721Listings(timePurchased_gt: windowStart)` + `erc1155Listings(timeLastPurchased_gt:
  windowStart, sold: true)`. Group by category for a breakdown.
- **Auctions settled volume**: `aavegotchi-gbm-baazaar-base` — sum `highestBid` over
  auctions `claimed: true` (or settled) within the window.
- **Sales counts**: counts of the same result sets.
- **USD**: GHST price — reuse whatever price source the app already has (or a GHST/USDC
  quote from `ghstUsdcLP`). If none, show GHST only and add USD later.
- Time windows: compute `windowStart = now - {86400, 7d, 30d, 90d}`; subgraph supports
  the `_gt` time filters. For 3M, paginate if >1000 rows.

> Cross-check the subgraph's own aggregate entities first (some Aavegotchi subgraphs
> expose `statistic`/`dailyStat` rollups) — if present, use those instead of summing raw
> listings (cheaper + matches the dapp's numbers exactly). Verify before building.

---

## 4. UX
- Header: "Marketplace Stats", chain = Base (fixed for now), window tabs.
- Cards: Baazaar volume + count, Auctions volume + count, each GHST + ~USD, with a small
  per-category breakdown (gotchis/wearables/parcels/…). Optional sparkline later.

## 5. Build phases
1. Window-bounded volume/count queries (Baazaar + Auctions).
2. Stats page + Activity-header link.
3. USD conversion + category breakdown.

## 6. Acceptance (incl. dapp confirmation)
- Our 24H/7D/30D/3M Baazaar + Auctions volumes **match `dapp.aavegotchi.com/stats`**
  (Base) within rounding, side-by-side via Playwright.
- 0 console errors.

## 7. Open questions
- Does a subgraph rollup entity exist (preferred over raw summation)?
- Exact "settled" definition the dapp uses for auctions (claimed vs ended).
