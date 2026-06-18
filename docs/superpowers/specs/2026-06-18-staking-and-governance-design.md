# Governance & Ancillary Pages — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build
**Project:** gotchi-closet
**Reference:** `2026-06-18-dapp-parity-overview.md`

Covers the remaining non-trading dapp surfaces (excluding Rarity Farming leaderboard
**and GHST/LP staking**, per request): **DAO/governance** and the light **ancillary**
pages (Tools, FAQ, Announcements, Game Center, Agents).

---

## 0. Excluded as dead — GHST/LP Staking

**GHST/LP staking (`/staking`, `gltrStaking` + LP pools) is intentionally NOT built.**
Per product decision (2026-06-18) it's treated as dead — do not implement. Kept here only
as a record so it isn't re-scoped later.

---

## 2. DAO / Governance

The dapp's `/dao?p=treasury` shows DAO treasury + governance. Mostly read-only +
outbound to Snapshot/forum.

### Scope (v1, low effort)
- Treasury overview: balances of the DAO/foundation addresses (e.g.
  `daoFoundationLiquidity` `0x62DE…682E`) via ERC20 `balanceOf` + token prices.
- Governance: embed/link **Snapshot** space + governance forum (the dapp links out;
  on-chain voting is not a Base diamond call). Confirm the Snapshot space + forum URL
  from the dapp chunk.

### Placement
New `/dao` route (or fold treasury into `/stats` as a "Treasury" tab if we want to avoid
a route — decide at build; treasury is analytics-like). Governance = outbound links.

### Acceptance
Treasury figures match the dapp; links resolve. 0 console errors.

---

## 3. Ancillary pages (links/embeds — minimal build)

These are content/redirect surfaces; replicate as light pages or header links, not full
features:

| Page | Dapp route | Plan |
|---|---|---|
| Tools | `/tools` | A curated grid of community tools/dashboards (links). Static data. |
| FAQ | `/faq` | Static content (can mirror dapp copy or link out). |
| Announcements | `/announcements` | Link out to the blog/announcements, or embed feed. |
| Game Center | `/games` | Out of scope to host games — link to the dapp/Gotchiverse + list mini-games. |
| Agents | `/agents` | External (AI agents) — link out. |

### Placement
Fold all of these under a single **"More"** menu in the header (mirrors the dapp's
Community/About menus). No heavy per-page work.

---

## 4. Build order (within this spec)
1. DAO treasury (read-only) + governance links.
2. Ancillary "More" menu (Tools/FAQ/Announcements/Games/Agents links).

## 5. Open questions
- Snapshot space + forum URLs.
- Is hosting Tools/FAQ content worth it vs linking to the dapp?
