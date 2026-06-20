# Plan 004 — Wisp storefront: advertise + sell the Soul MCP (ETH/USDC, BYO-LLM)

> **Brand: Wisp.** The product is **Wisp** (*"the soul that remembers; you bring the voice"*). This plan builds the `/mcp` page that the **"Powered by Wisp"** badge (Plan 003) links to — the single destination that **explains + sells + prices + documents implementation**.

**Written against commit:** `5ef9570` (branch `build/all-features`). Re-verify excerpts if HEAD has moved.

**Type:** Multi-phase build plan. Large — each phase (A–F) is independently shippable and could be split into its own sub-plan if an executor prefers. Do the phases in order; later phases depend on earlier ones.

**Depends on:** Plan 001 (the MCP server exists, stdio). Far more valuable after Plan 002 (collection-agnostic — you sell "souls for any NFT," not just Aavegotchi). This plan adds the *remote transport + payments + storefront* around the 001 server.

---

## What this delivers

Turn gotchi-closet into the **storefront** that advertises and sells metered access to the Soul MCP, paid in **ETH/USDC on Base** (NOT GHST). gotchi-closet's free web app is the demo/funnel; the MCP is the product.

### Product definition — what a customer gets

The MCP is **headless capability, BYO-LLM**: the server makes **zero LLM calls** (invariant from 001). The customer brings their own model + keys; the MCP provides the soul, persona, memory, context, and roast scaffold. From their end-user's seat it's a **full chat + roast experience** — powered by the customer's model, wired into the customer's own surface (Discord bot, dapp, agent). They do not get gotchi-closet's UI.

| Capability | MCP provides | Customer brings |
|---|---|---|
| Chat | persona + soul context + memory + lore + history (`build_chat_context` → ready `{systemPrompt, messages}`) | their model generates the reply |
| Roasts | archetypes, voices, rules, setup (`get_roast_setup`) + judge rules (deterministic or prompt) | their model writes the burns |
| Soul | depth engine, signals, past lives, on-chain seal + verify | (nothing — pure MCP) |

### The free/paid line — **stateless = free, stateful = paid**

Not "chat vs no chat." The *state* is the moat (generation is commodity the customer brings):

- **Free tier (funnel):** read + context tools (`get_soul`, `get_persona`, `build_chat_context` stateless, `get_roast_setup`, `verify_soul`), rate-limited, 1 collection, anonymous (no persisted memory). Near-zero cost to serve.
- **Paid tiers:** the **persistent, evolving** soul — memory that carries across sessions, depth/kinship growth over time, chat history, roast XP + leaderboards, on-chain seals, multi-collection, higher rate limits.

A static persona snapshot is copyable; a soul that *remembers and grows* over months is not — it requires the ongoing service. So you give away the cheap/commoditized part and charge for the durable state.

### Pricing (USD-denominated, settled in ETH or USDC on Base)

Quote in USD for predictability; settle in crypto. **Do not denominate recurring prices in raw ETH** (a "0.05 ETH/mo" plan swings with ETH price). Read a Base ETH/USD oracle at pay-time to compute the ETH amount, or accept USDC 1:1.

| Tier | Price (USD-denominated) | What |
|---|---|---|
| Free | $0 | stateless read/context tools, rate-limited, 1 collection |
| Pro | ~$19/mo | persistent memory, seals, a few collections, higher rate |
| Project | ~$99–299/mo | power a whole collection (tier by active-soul count), branding, support |
| Enterprise / white-label | $1–3k setup + $500+/mo or rev-share | custom, white-label, dedicated |
| Per-seal micro-fee | ~ETH equiv of a few $ | monetize the on-chain seal directly |
| Hosted-generation add-on (Phase F) | metered (prepaid credits) | optional: MCP runs a tuned model so the buyer doesn't BYO |

**Two payment rails, kept separate:** the existing in-app companion premium stays **GHST** (gotchi-holders, on-brand sink — do not change it). This storefront is **ETH/USDC** (outside devs/projects who don't hold GHST).

**Meter on value, not compute:** active souls, collections, write/seal operations, request volume. There is no LLM bill to protect on the base product (only cached subgraph/RPC). The single exception is the Phase F hosted-generation add-on — that re-introduces LLM cost and MUST be prepaid/credit-gated (burn-on-success), exactly like the existing premium tier in `server/routes/companion.ts:86-90`.

---

## Files

- **Create (server):** `server/mcp/http.ts` (remote HTTP/SSE transport + API-key auth middleware), `server/mcp/accounts.ts` (MCP account + credit/plan ledger, mirroring `server/companion/db.ts`), `server/routes/mcpBilling.ts` (buy/claim/status endpoints), `server/payments/verifyEthPayment.ts` and `server/payments/ethUsd.ts` (price oracle).
- **Create (client):** `src/pages/WispPage.tsx` (the `/mcp` page: explains + sells + pricing + implementation docs + buy flow), plus a route entry.
- **Modify:** `server/app.ts` (mount `mcpBilling` routes + the MCP HTTP transport), `src/app/router.tsx` (add the `/mcp` route), `package.json` if a new dep is needed (avoid if possible).
- **Reuse (do not modify):**
  - `server/lending/verifyPayment.ts` → pattern for `verifyEthPayment`/USDC verification (read excerpt below).
  - `server/companion/db.ts` → pattern for the idempotent ledger: `companion_entitlements` + `companion_premium_tx`, `addCredits` (idempotent by tx_hash, txn-wrapped), `burnCredit` (atomic), `getCredits` (read excerpt below).
  - `server/companion/auth.ts` → `premiumSignatureValid` (wallet-signature gate pattern, for tying an API key to a paying wallet).
  - `server/mcp/tools.ts` + `server/mcp/index.ts` (from 001) → the tool handlers the HTTP transport exposes.

### Reference excerpt — payment verification (GHST/ERC-20), to mirror for ETH/USDC

```ts
// server/lending/verifyPayment.ts:30-72 (abridged): verify an ERC-20 Transfer in a tx receipt
const receipt = await c.getTransactionReceipt({ hash: args.txHash });
if (receipt.status !== "success") return { ok: false, error: "tx reverted" };
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== GHST_BASE.toLowerCase()) continue;
  const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], ... });
  // match from/to/value === expectedValueWei → ok
}
```
- **USDC** is the same pattern with the USDC contract address (Base native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — VERIFY before hardcoding) and 6 decimals (not 18).
- **Native ETH** is different: there is no Transfer event. Read `getTransaction({hash})` and check `tx.to === operator` and `tx.value === expectedWei`, plus `getTransactionReceipt` for `status === "success"`.

### Reference excerpt — idempotent ledger, to mirror for the MCP account ledger

```ts
// server/companion/db.ts:127-158 (abridged)
export function addCredits(wallet, amount, txHash): number {
  const tx = d.transaction(() => {
    if (seen(txHash)) throw new Error("tx already credited");   // idempotency
    insert into _premium_tx (txHash, ...);
    upsert entitlements SET credits = credits + amount;
  });
  tx(); return getCredits(wallet);
}
export function burnCredit(wallet): boolean {                    // atomic, never negative
  const info = run(`UPDATE ... SET credits = credits - 1 WHERE wallet=? AND credits > 0`);
  return info.changes === 1;
}
```

---

## Phases & steps

### Phase A — MCP account + plan/credit ledger
- [ ] **A1.** Create `server/mcp/accounts.ts` with its own SQLite tables (reuse `getDb()` from `server/companion/db.ts` or a parallel DB via `MCP_DB_PATH`): `mcp_accounts (api_key TEXT PRIMARY KEY, owner_wallet TEXT, plan TEXT NOT NULL DEFAULT 'free', credits INTEGER NOT NULL DEFAULT 0, active_souls INTEGER DEFAULT 0, created_at INTEGER)` and `mcp_payments (tx_hash TEXT PRIMARY KEY, api_key TEXT, asset TEXT, amount_wei TEXT, credited_at INTEGER)`. Provide `createAccount(ownerWallet) -> apiKey` (random 32-byte hex, prefixed e.g. `gck_`), `getAccountByKey(apiKey)`, `addMcpCredits(apiKey, amount, txHash)` (idempotent by tx_hash, mirror `addCredits`), `burnMcpCredit(apiKey)` (mirror `burnCredit`), `planFor(apiKey)`.
- [ ] **A2.** Unit test `server/mcp/accounts.test.ts` (vitest, DB-isolation via `closeDb()` like `server/soul/*.test.ts`): create account → key is unique + prefixed; `addMcpCredits` is idempotent (second call with same tx_hash throws "already credited"); `burnMcpCredit` never goes negative. Run: `npx vitest run server/mcp/accounts.test.ts` → pass.

### Phase B — Remote transport + API-key auth (gate the 001 tools)
- [ ] **B1.** Create `server/mcp/http.ts` exposing the 001 MCP over Streamable HTTP/SSE (use the `@modelcontextprotocol/sdk` HTTP/SSE server transport — confirm the exact export from the installed SDK; STOP and report if absent). Require an `Authorization: Bearer <apiKey>` (or `?key=`) on connect; resolve via `getAccountByKey`. Unknown/missing key → anonymous **free** plan.
- [ ] **B2.** Add a per-tool authorization gate: free plan → only the stateless read/context tools + rate limit (reuse the in-memory token-bucket pattern at `server/routes/companion.ts:26-34`, keyed by api_key/IP); paid plans → unlock stateful tools (persistent memory writes, seal, multi-collection) and higher limits. Stateful = anything that writes to the soul store or calls `buildSealAttestation`.
- [ ] **B3.** Mount the HTTP transport in `server/app.ts` under `/mcp` (e.g. `app.use('/mcp', mcpHttpHandler)`). Keep the stdio entry (`server/mcp/index.ts`) untouched for local users. Verify: `npm run typecheck` exit 0; boot the server and connect with the MCP Inspector over HTTP using a test key.
- [ ] **B4.** **Cost invariant still holds:** `grep -rnE "llmProvider|complete\(" server/mcp/` → no matches (the HTTP transport must not add generation).

### Phase C — ETH/USDC payment + USD denomination
- [ ] **C1.** Create `server/payments/verifyEthPayment.ts`: `verifyEthPayment({txHash, expectedFrom, expectedTo, minValueWei})` reads `getTransaction` + `getTransactionReceipt` (status success, `to===expectedTo`, `value>=minValueWei`). Add `verifyErc20Payment({...token, decimals})` generalizing `verifyGhstPayment` for USDC. Reuse the singleton client pattern from `verifyPayment.ts:7-11`.
- [ ] **C2.** Create `server/payments/ethUsd.ts`: read Base ETH/USD from a Chainlink aggregator (`latestRoundData`) — Base ETH/USD feed `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` (VERIFY on-chain before hardcoding; if the feed read fails, STOP and report — do NOT fall back to a guessed price). Expose `usdToEthWei(usd)` and a short TTL cache.
- [ ] **C3.** Create `server/routes/mcpBilling.ts`: `POST /api/mcp/account` (sign-with-wallet → issue api key), `POST /api/mcp/buy` `{apiKey, plan|credits, asset:'eth'|'usdc', txHash}` → verify payment (USD-denominated amount via `ethUsd` for ETH, or 1:1 for USDC) → `addMcpCredits`/set plan idempotently → return new balance/plan. `GET /api/mcp/account/:apiKey` → plan + balance + usage. Mount in `server/app.ts`.
- [ ] **C4.** Tests: `verifyEthPayment` matches a known Base ETH-transfer tx (use a fixture/mock); `usdToEthWei` returns a sane wei amount for $100 given a mocked feed answer; `buy` is idempotent on repeated `txHash`. Run the new tests → pass.

### Phase D — Metering & plan enforcement
- [ ] **D1.** Wire the auth gate (B2) to the ledger (A): on each metered op (stateful tool call / seal), check plan + `burnMcpCredit` where credit-metered, or enforce rate windows where plan-metered. Free tier = stateless + low rate; paid = stateful + high rate; per-seal = burns credits or requires a per-seal ETH micro-payment. **Never meter the stateless read/context tools by LLM (there is none).**
- [ ] **D2.** Emit a usage record per call (count by api_key + tool) so the dashboard (E) and future telemetry can show consumption. Keep it a cheap insert; no PII beyond the api_key.

### Phase E — Storefront / marketing + docs page
- [ ] **E1.** Create `src/pages/WispPage.tsx` and route it at `/mcp` in `src/app/router.tsx`. This is the destination of the "Powered by Wisp" badge (Plan 003) and must do four jobs — **explain, sell, price, document implementation**:
  - **Explain:** the pitch ("Give any agent — or any NFT — a soul. Bring your own model."), the BYO-LLM model, the stateless-free / stateful-paid story.
  - **Sell + price:** the free/paid matrix + the pricing table (USD-denominated, paid in ETH/USDC on Base).
  - **Implementation / integration docs:** a quickstart, the tool/resource list with example I/O, a copy-paste Claude Desktop `mcpServers` config block, code snippets for the HTTP transport (TS + Python: connect with an API key, call `get_persona` / `build_chat_context`, feed the result to the integrator's own model), and an API reference (endpoints, `Authorization` header, error shapes).
  - **Onboard:** "Get an API key" (connect wallet → `POST /api/mcp/account` → show key once) + "Buy credits/plan" (ETH/USDC via the connected wallet → `POST /api/mcp/buy`).
  Match existing page conventions (see `src/pages/ExplorerPage.tsx` for structure + wagmi usage).
- [ ] **E2.** Add a small entry point in the app nav/footer linking to `/mcp` so the free web app funnels to the product. Keep it tasteful — the app stays "free for the community"; the MCP is a separate offering.
- [ ] **E3.** Verify: `npm run build` exit 0; the page renders, the API-key + buy flows hit the Phase C endpoints.

### Phase F — (Optional) Hosted-generation upsell
- [ ] **F1.** Add an opt-in `generate: true` mode to the paid context tools where the MCP runs a tuned model itself (reusing `server/companion/llmProvider.ts`) and returns the finished text. **This is the ONLY place LLM cost re-enters.** It MUST: require a paid plan, **burn a credit only on success** (mirror `server/routes/companion.ts:86-90`), and be capped (`max_tokens`, per-key daily ceiling). This is a convenience premium for buyers who don't want to BYO — it does not change the default BYO-LLM product.
- [ ] **F2.** Keep this isolated so the base MCP's zero-LLM invariant is unaffected: the hosted path lives behind the billing gate, never in the free/stateless tools.

---

## Done criteria (machine-checkable)

- `npm run typecheck` → exit 0; `npm run build` → exit 0.
- `npx vitest run server/mcp/accounts.test.ts server/payments` → all pass.
- `grep -rnE "llmProvider|complete\(" server/mcp/tools.ts server/mcp/http.ts` → no matches (base/transport stay zero-LLM; only the Phase F hosted path may import llmProvider, and only behind the paid gate).
- A free API key can call the stateless tools but is rejected (clear error) when calling a stateful tool; a funded key (after a verified test payment) can.
- `POST /api/mcp/buy` credits idempotently (replaying the same `txHash` returns "already credited", balance unchanged).
- The `/mcp` page builds and the connect→issue-key→buy flow works against a testnet/fork or a real small payment.

## Test plan

- `accounts.test.ts` — key issuance uniqueness, idempotent credit, atomic burn (Phase A).
- `verifyEthPayment.test.ts` / `verifyErc20.test.ts` — match/no-match against fixtures; reverted tx rejected (Phase C).
- `ethUsd.test.ts` — `usdToEthWei($100)` with a mocked feed answer returns expected wei; feed failure throws (no silent fallback).
- `mcpBilling.test.ts` — buy idempotency; free vs paid tool gating returns the right status codes.
- Follow the vitest + `closeDb()` isolation pattern in `server/soul/*.test.ts` and the existing `server/companion/db.test.ts`.

## Maintenance notes

- **Two rails stay separate.** Don't let the GHST consumer-premium code (`server/routes/companion.ts` premium claim) and the ETH/USDC MCP billing bleed into each other — different audiences, different currencies.
- **USD-denomination is deliberate.** If anyone "simplifies" to raw-ETH-denominated subscriptions, revenue becomes a casino. Keep the oracle in the loop, or accept USDC 1:1.
- **The zero-LLM invariant is the moat's cost-safety.** Phase F is the only sanctioned LLM reentry and must stay behind the paid, burn-on-success gate. A new LLM call in the free/stateless path is a money leak.
- **Key handling:** show the API key once, store only a hash if you can; never log keys; treat them like secrets. Rotate on request.

## Escape hatches

- If the installed `@modelcontextprotocol/sdk` has no HTTP/SSE server transport, **STOP and report** — do not hand-roll a non-standard transport without flagging it.
- If the Chainlink Base ETH/USD feed address can't be verified on-chain, **STOP and report** rather than hardcoding an unverified oracle (mispricing = lost or refunded revenue).
- If `verifyEthPayment` can't distinguish a contract-wallet payment (no plain `to`/`value`), **STOP and report** — handle smart-wallet payers explicitly rather than silently rejecting them.
- Do not deploy any new contract in this plan; payments are plain transfers to the operator wallet. If escrow/streaming is wanted later, that's a separate plan with its own contract review.
