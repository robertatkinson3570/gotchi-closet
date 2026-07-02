# Plans — Wisp (Soul MCP product line)

**Product brand: Wisp** — *"the soul that remembers; you bring the voice."* The engine is a Soul MCP; **Wisp** is the brand the storefront sells, and gotchi-closet is **"Powered by Wisp."** Collection-agnostic (no Aavegotchi baggage).

Advisor plans (improve skill). **Written against commit `5ef9570`.** These are specs for an executor; no source code has been changed. Author writes plans only; execution happens separately in an isolated worktree.

## The thesis (one paragraph)

Aavegotchi the niche is shrinking, but gotchi-closet's reusable asset — the soul/companion/roast engine — is ~2 days from being collection-agnostic, and its only real cost (LLM generation) can be pushed onto consumers via **Bring-Your-Own-LLM MCP**. So: package the engine as a Soul MCP whose server makes **zero LLM calls** (clients bring their own model + keys), make **gotchi-closet itself customer #1** of that MCP, and turn gotchi-closet into the **storefront** that advertises and sells metered access. The web app stays free for the community (funnel + proof); the money comes from selling the agent-native engine to builders/projects.

## Execution order & dependency graph

```
001 Soul MCP (BYO-LLM, stdio, read+context tools)   ← foundation, FULL PLAN written
  ├─ 002 Generalize engine (collection-agnostic)     ← unlocks "any NFT", multiplies value
  ├─ 003 gotchi-closet dogfoods the MCP (customer #1) ← proves BYO-LLM split, dedupes assembly
  └─ 004 Storefront: advertise + sell on gotchi-closet ← needs HTTP transport + API-key metering
000 Cost-safety: cap distillToEchoes LLM fan-out      ← independent, do anytime (stops a money leak)
```

- **000 and 001 have no dependencies** — start with either.
- **003** depends on 001 (needs the MCP context tools to call).
- **004** depends on 001 (+ an HTTP/SSE transport and auth) and is far more valuable after **002** (sell multi-collection, not just Aavegotchi).
- **002** is independent of 001 but should land before 004 so the product you sell isn't Aavegotchi-only.

## Status table

| # | Plan | Status | Effort | Depends on | Notes |
|---|------|--------|--------|-----------|-------|
| 000 | Cap `distillToEchoes` LLM fan-out (`server/soul/transfer.ts`) | TODO (not yet expanded) | S | — | Uncapped `Promise.all` of per-memory LLM calls = money leak; batch it |
| 001 | Soul MCP (BYO-LLM) | **PLAN READY** (`001-soul-mcp-byo-llm.md`) | M | — | Server makes ZERO LLM calls; read+context tools + embody prompt |
| 002 | Generalize engine (config-extract traits/lore/prompts/subgraph) | TODO (not yet expanded) | M | — | Make tools take `(collection, tokenId)`; soul depth already portable |
| 003 | gotchi-closet = customer #1 (dogfood) + "Powered by Wisp" badge | **PLAN READY** (`003-gotchicloset-powered-by-wisp.md`) | S–M | 001 | `/chat` sources context from the Wisp MCP, runs its own LLM; adds the Powered-by-Wisp badge → `/mcp` |
| 004 | Storefront: advertise + sell **Wisp** | **PLAN READY** (`004-storefront-sell-mcp.md`) | M–L | 001 (+002) | the `/mcp` page = explains + sells + pricing + implementation; ETH/USDC (USD-denominated) on Base; HTTP transport + API keys; stateless-free / stateful-paid; hosted-gen upsell |

**001, 003, and 004** are expanded into full executable plans. Ask to expand **000** (cost leak) and **002** (generalize) into full plans and they'll be written here with the same rigor.

---

## Roadmap entries (not-yet-full plans)

### 000 — Cost-safety: cap the soul-transfer LLM fan-out
`server/soul/transfer.ts` `distillToEchoes()` runs `Promise.all` of an LLM "depersonalize" call **per memory, uncapped**. A transfer on a 20-memory soul fires 20 simultaneous OpenAI calls. Add a batch size + per-transfer cap (e.g. process the N most-weighted memories, sequentially or in small batches), with the existing `FALLBACK_FRAGMENT` for the rest. Independent of the MCP work; do it whenever — it's the one place the free tier leaks money.

### 002 — Generalize the engine (collection-agnostic)
Extract the Aavegotchi-specific bits the coupling audit found into config so the engine runs for any "character with N numeric traits + name + image + owner wallet":
- `src/lib/companion/personality.ts` `TRAITS` (NRG/AGG/SPK/BRN) + `UNIVERSAL_BASE_PERSONA` → pluggable trait/lore config.
- `src/lib/companion/knowledge.ts` lore snippets → config-driven.
- `src/lib/roast/prompts.ts` + `templates.ts` archetypes/voices/burns → config (heaviest piece: rewrite burns per collection).
- `server/companion/gotchiState.ts` subgraph query → parameterized (endpoint already env-driven).
- Soul depth (`server/soul/depth.ts`, `src/lib/soul/quickDepth.ts`) is already portable — no change.
Then MCP tools (001) take a `collection` arg. Soul *seal* stays per-collection (deploy a seal contract per chain) or is skipped for off-chain characters.

### 003 — gotchi-closet dogfoods the MCP (customer #1)
Refactor `server/routes/companion.ts` `/chat` so the context assembly (`buildPersonality` + `soulDepthSnapshot` + `assembleMessages`) is sourced from the MCP's `build_chat_context` (imported in-process from `server/mcp/tools.ts` — no network hop needed), and the route then calls its **own** `llmProvider.complete(systemPrompt, messages, tier)` as today. Net effect: the assembly logic lives in ONE place (consumed by both external integrators and the web app), and gotchi-closet becomes the reference "BYO-LLM customer" (it brings Groq/OpenAI). Roast/arena paths get the same treatment via `get_roast_setup`. Keep all current behavior (credits, premium signature gate, content filter, rate limit) — this is a refactor-behind-the-seam, not a behavior change; cover with the existing companion tests.

### 004 — Storefront: advertise + sell the MCP on gotchi-closet
Two parts:
1. **Marketing/docs surface** in the web app: a "Gotchi Soul MCP" page — pitch ("give any agent a gotchi's soul; bring your own model"), the tool/resource list, a copy-paste Claude Desktop config, live examples, and (after 002) the multi-collection story.
2. **Sell + meter (now fully specced in `004-storefront-sell-mcp.md`):** remote **HTTP/SSE transport** + **API-key auth**; paid in **ETH/USDC on Base, USD-denominated** (NOT GHST — GHST stays the *consumer* companion-premium rail; the MCP product is for outside devs who don't hold GHST). Free **stateless** tier (persona/lore/roast-setup) vs paid **stateful** tier (persistent memory, evolving soul, history, XP, seals, multi-collection). The MCP ledger mirrors the existing idempotent `addCredits`/`burnCredit` pattern (`server/companion/db.ts`) keyed by API key. Meter *value* (active souls, writes, seals, volume), not compute — there is no LLM bill on the base product. Optional **hosted-generation** upsell (Phase F) is the one place LLM cost re-enters and is gated behind the paid, burn-on-success path.

**Revenue shape (honest):** free open read MCP = distribution/funnel (near-zero cost). Paid = a handful of projects/builders integrating multi-collection souls, metered in ETH/USDC. A profitable side-product path (a few B2B integrations + the in-app GHST sinks), not a moonshot — but its value does **not** depend on Aavegotchi surviving, which is the entire point.

---

# Subgraph data-gap plans (2026-07-02)

Advisor plans (improve skill) from the subgraph feature-gap audit: all 8 live
Goldsky subgraphs were introspected and compared against every query in
`src/` + `server/`. **Written against commit `60fd7c3`.** Each plan is
self-contained for a zero-context executor. Note: this directory carries two
older numbering series (Wisp 000–004 above, and an earlier advisor set
001–006); numbering continues monotonically from 006.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 007  | On-chain outfits (WearablesConfig) + wardrobe history (EquippedWearableOwner) | P1 | M | — | DONE — reviewed & approved 2026-07-02; branch `advisor/007-onchain-outfits` (`36f66ee`), unmerged |
| 008  | Price history & provenance sparkline (historicalPrices / timesTraded) | P1 | S | — | DONE — reviewed & approved 2026-07-02; branch `advisor/008-price-history` (`9d23389`), unmerged |
| 009  | GBM earnings dashboard (Incentive / User scorecard / seller P&L) | P2 | M | — | DONE — reviewed & approved 2026-07-02; branch `advisor/009-gbm-earnings` (`9d80f18`), unmerged |
| 010  | Wearable holder distribution + wearables in portfolio floor value (ItemTypeOwnership) | P2 | M | — | DONE — reviewed & approved 2026-07-02; branch `advisor/010-wearable-intel` (`0deb0e3`), unmerged |
| 011  | XP drop tracker (aavegotchi-xp-base) | P3 | S | — | DONE — reviewed & approved 2026-07-02; branch `advisor/011-xp-drops` (`753bfe6`), unmerged |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Dependency notes

- All five are independent; recommended order is by number (value ÷ effort).
- 007, 010, and 011 all insert sections into `GotchiActionsPanel.tsx` /
  `WearableDetailModal.tsx` — content doesn't overlap, but whichever lands
  later must re-locate the `RecentSales` insertion point (each plan's STOP
  conditions cover this).

## Findings considered and rejected (2026-07-02 audit — don't re-audit)

- **ERC-7589 wearable-rental UI** (`roleAssignments`): entity is empty on
  Base — no market to serve yet. Revisit if usage appears (`tokenCommitments`
  do exist).
- **Socket bridge feed** (`socket-bridge-base`): belongs inside the already
  spec'd get-tokens page (`docs/superpowers/specs/…get-tokens-design.md`),
  not a standalone feature.
- **GBM raw event log** (`events`/`Transaction` interface): the Activity
  page already covers this via `auctions`/`bids`.
- **Alchemica subgraph** (`aavegotchi-alchemica-base`): balances-only
  (OpenZeppelin ERC20 schema); RPC already serves this need.
- **SwapAction analytics** (buy-with-any-token volume): a stats-page
  footnote at best; buy-with-any-token itself is in the baazaar-collections
  spec.
- **Lending income statements** (`GotchiLending.claimed` + gotchiverse
  `Stat`): deferred, not rejected — the live sample showed zero-amount
  claims; verify Base channeling/claim volume is non-trivial before planning
  (finding #6 of the audit, MED confidence).
