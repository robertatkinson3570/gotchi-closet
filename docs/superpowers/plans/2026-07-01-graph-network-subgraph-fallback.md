# The Graph Network Subgraph Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `aavegotchi-core-base` to The Graph decentralized network (free tier) and wire it into GotchiCloset's existing-but-dormant failover so the app survives a Goldsky outage.

**Architecture:** The app already has two-layer failover (client `src/graphql/subgraphFailover.ts`, server `server/aavegotchi/subgraphFetch.ts`) that activates when backup-URL env vars are set. We self-publish the official subgraph source to The Graph's decentralized network via Subgraph Studio (no Docker, no RPC, no VPS — The Graph's indexers do the indexing), then point the env vars at the gateway endpoint. One code change is required first: the client health poller currently probes BOTH endpoints every 45s per open tab, which alone would exhaust the 100k/month free query quota (~1,920 gateway queries/day/tab vs ~3,333/day budget) — we make the backup probe lazy.

**Tech Stack:** The Graph Subgraph Studio + gateway, `@graphprotocol/graph-cli@0.59.0`, TypeScript/Vite/vitest, GitHub Actions (VPS deploy), Vercel (frontend env).

---

## STATUS — resume here (updated 2026-07-01)

- **Task 1 DONE** — lazy backup probing implemented + spec/quality reviewed; commit `f835533` on `main`. 12/12 focused tests, full suite 456 green.
- **Task 2 DONE** — subgraph built at `C:\tmp\aavegotchi-core-subgraph` (upstream `aavegotchi/aavegotchi-core-subgraph` @ `419026d`, graph-cli 0.59.0, manifest verified: network base, all 5 data sources). NOTE: no global yarn — use `npx yarn ...` / `npx graph ...` there. Source is 2025-09-05 vintage; Task 5 parity check is the schema-drift guard.
- **Task 7 code half DONE** — workflow secret-sync + env-example docs; commit `e54c354` on `main`. Inert until the GH secret exists. Remaining Task 7: `gh secret set SUBGRAPH_URL_BACKUP ...`, Vercel env, deploy (needs Task 6 values).
- **Task 3 DONE** — user created Studio subgraph, slug `aavegotchi-core-base`, network Base. (Deploy key held by user; never commit it.)
- **Task 4 DONE (deploy) — SYNC IN PROGRESS** — deployed 2026-07-01 with local graph-cli 0.59.0 (`npx graph deploy --studio aavegotchi-core-base -l v0.0.2`; v0.0.1 also exists, same build `QmaF5BAiJVXYN22j7VoTqJ6JzzTXgL1QEHJ3yck1ghZZdB`, an ECONNRESET double-submit — cosmetic). Studio query URL: `https://api.studio.thegraph.com/query/1756009/aavegotchi-core-base/v0.0.2`. Indexing healthy from block 33,201,946 (~500 blk/min initially, no errors); Goldsky head was 48,080,274 → expect hours-to-days.
- **Task 5 DONE (2026-07-02) — PARITY PASSED.** Studio fully synced in <36h (48,123,285 ≈ Base head; hasIndexingErrors false). Stable entities (old sold listings, itemTypes, portals, first gotchis, full owner inventory) byte-identical to Goldsky; only diff = kinship +2 on Studio, explained by Goldsky being STALLED at block 48,080,274 for ~24h (real silent-stall incident — validates the project). Notes: (a) gotchi IDs on Base start at #3 (no #1/#2); (b) Studio deployment PRUNES history — time-travel `block:{number}` queries only work near head; app uses none (grepped src/ + server/), so harmless; (c) `Aavegotchi.listing` field doesn't exist in this schema on either endpoint.
- **Task 6 DONE (2026-07-02)** — user published to Arbitrum One. Subgraph ID `GYwfMkWWeD6ZDXQLWd2MkiwwKK16QmsWiUc22GG5kX7U`; API key `gotchicloset-fallback` created (domain-restricted + spend-capped; key NOT in repo). Upgrade indexer reports synced/healthy at chain head (shares Studio's index infra — no second sync).
- **Task 7 DONE (2026-07-02)** — GH secret `SUBGRAPH_URL_BACKUP` set + VPS deploy dispatched manually (workflow is path-filtered; docs pushes don't trigger it) → log shows `SUBGRAPH_URL_BACKUP synced (len=123)`. Vercel `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` added via CLI; prod build verified to contain the gateway URL in the served bundle.
- **Task 8 PARTIAL** — steady state can't be fully verified yet: gateway returns transient `bad indexers ... Unavailable` (allocation warm-up right after publish; expected to clear within ~an hour). Failover is safe in this state (health probes reject an erroring backup). REMAINING: re-probe gateway until serving; then confirm auto-failover engages (Goldsky still stalled at 48,080,274 as of this writing — fallback should go hot immediately); check Studio API-key usage after 24–48h (lazy probing ⇒ near-zero steady-state). Runbook written: `docs/subgraph-fallback-runbook.md`; mirror runbook marked SUPERSEDED.
- Branch note: work is committed directly on `main` (repo convention; a concurrent agent session also commits here — always `git add` specific paths only).

## CONTEXT — read this first (assume zero prior session knowledge)

### Why
GotchiCloset's critical data dependency is the official Goldsky **core Base** subgraph. Goldsky is the DAO's *fourth* subgraph host (The Graph hosted svc → Alchemy → Goldsky → currently evaluating Flux), and the June 6 2026 DAO call confirmed the community's Flux replacement runs a **single instance with no redundancy**. If Goldsky is sunset or stalls, the app breaks. Nobody (including Pixelcraft) has published the core Base subgraph to The Graph *decentralized network* — so we publish our own copy as an independent fallback.

### Key facts (verified 2026-07-01 — do not re-derive)
| Fact | Value |
|---|---|
| Primary (Goldsky core) | `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn` |
| Subgraph source repo | `github.com/aavegotchi/aavegotchi-core-subgraph` (branch `main`); archived copy in private repo `robertatkinson3570/gv2` and locally at `C:\Cursor\gv2\aavegotchi-core-subgraph` |
| Toolchain | Node ≥ 20, yarn, `@graphprotocol/graph-cli@0.59.0`, `graph-ts@0.31.0`. Repo scripts: `prepare:base`, `codegen`, `build` (verified on `main` 2026-06-20; if names differ, check the repo's `package.json`) |
| Data sources / start blocks (`config/base.json`) | core diamond `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` @ 33201946 (earliest), wearable @ 33202019, fakeCard @ 33221297, fakeGotchis @ 33221313, realm @ 33969747 |
| The Graph free plan | 100,000 queries/month free, then $2 per 100k (Growth plan, credit card or GRT). Billing: https://thegraph.com/docs/en/subgraphs/billing/ |
| Publishing | Deploy to Subgraph Studio (https://thegraph.com/studio/) first; then Publish on-chain to **Arbitrum One** (cents of gas — wallet needs a few dollars of ETH on Arbitrum). The 3,000 GRT curation signal is **optional** — the Sunrise Upgrade Indexer indexes all published subgraphs automatically. Base is a fully supported indexing network. |
| Gateway URL format | `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>` |
| API key security | The client env var is baked into the public Vite bundle → the key WILL be public. Mitigate in Studio: restrict key to domains + set a monthly spend cap. Studio docs: https://thegraph.com/docs/en/subgraphs/querying/managing-api-keys/ |
| Existing failover env slots | Client: `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` (Vercel). Server: `SUBGRAPH_URL_BACKUP` (VPS `.env`, synced from GitHub secrets by `.github/workflows/deploy-autorenew.yml`). Both empty today = failover is a no-op. |
| VPS access | SSH refused; the VPS `.env` is managed ONLY via the GH Actions secret-sync step in `deploy-autorenew.yml` (or hPanel terminal manually). |
| Quota math | Health poller: both endpoints every 45s/tab → backup probe = 1,920 queries/day/always-open tab. Free tier ≈ 3,333/day. ~2 always-open tabs = whole quota. Hence Task 1 (lazy probe) BEFORE enabling. |

### Failover architecture today (all committed, all dormant)
- `src/graphql/subgraphFailover.ts` — urql fetch wrapper: per-request hard fallback + 45s background poll comparing `_meta` block heights (`chooseUrl`, threshold 25 blocks). No-op when `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` is empty.
- `src/graphql/client.ts` — urql client already routes through `failoverFetch` and calls `startHealthPolling()`.
- `server/aavegotchi/subgraphFetch.ts` — Express-side primary→backup retry on network error / non-OK. No polling. No-op when `SUBGRAPH_URL_BACKUP` is empty. Used by `server/lending/relist.ts` and `server/companion/gotchiState.ts`.
- Tests: `src/graphql/subgraphFailover.test.ts` (vitest, pure `chooseUrl` tests).

Scope note: the app also queries three other Goldsky subgraphs (`src/lib/subgraph.ts`: gotchiverse, GBM, SVG) — **out of scope**; failover covers core only. Same recipe applies later if wanted.

### Human-in-the-loop
Tasks 3, 6 and parts of 7 need the user's wallet / Studio dashboard / Vercel dashboard. The executing agent must STOP at those steps, print exactly what the user must do, and wait for the user to report back the produced values (deploy key, subgraph ID, API key).

---

### Task 1: Lazy backup probing (code, TDD — do this first, it's a prerequisite for enabling the fallback)

The 45s poller must stop touching the metered backup while the primary is demonstrably healthy. Design: probe the primary every cycle (Goldsky is free/unmetered); only probe the backup when (a) we're currently failed-over to it, (b) the primary is unreachable/erroring, or (c) the primary's block number did not advance since the previous poll (silent stall — Base produces a block every ~2s, so any healthy 45s window must advance).

**Files:**
- Modify: `src/graphql/subgraphFailover.ts` (function `refreshActiveUrl`, ~lines 82–91; add `shouldProbeBackup` + module-level `lastPrimaryBlock`)
- Test: `src/graphql/subgraphFailover.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/graphql/subgraphFailover.test.ts` (the `h` helper and `P`/`B` constants already exist at the top of the file):

```typescript
import { shouldProbeBackup } from "./subgraphFailover"; // merge into the existing import line

describe("shouldProbeBackup", () => {
  it("skips the metered backup probe when primary is healthy and advancing", () => {
    expect(shouldProbeBackup(h(P, 1010), 1000, true)).toBe(false);
  });

  it("skips on the first poll (no previous block yet)", () => {
    expect(shouldProbeBackup(h(P, 1000), null, true)).toBe(false);
  });

  it("probes when the primary block is not advancing (silent stall)", () => {
    expect(shouldProbeBackup(h(P, 1000), 1000, true)).toBe(true);
    expect(shouldProbeBackup(h(P, 990), 1000, true)).toBe(true); // went backwards
  });

  it("probes when the primary is unreachable or has indexing errors", () => {
    expect(shouldProbeBackup(h(P, null, false), 1000, true)).toBe(true);
    expect(shouldProbeBackup(h(P, 1010, true, true), 1000, true)).toBe(true);
  });

  it("always probes while running on the backup (to detect primary recovery)", () => {
    expect(shouldProbeBackup(h(P, 1010), 1000, false)).toBe(true);
  });
});
```

Note: the existing import line is `import { chooseUrl, STALE_BLOCK_THRESHOLD, type Health } from "./subgraphFailover";` — add `shouldProbeBackup` to it rather than a second import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/graphql/subgraphFailover.test.ts`
Expected: FAIL — `shouldProbeBackup` is not exported.

- [ ] **Step 3: Implement**

In `src/graphql/subgraphFailover.ts`, add below `chooseUrl` (after line 54):

```typescript
/**
 * Decide whether the metered backup endpoint needs probing this cycle (exported
 * for unit testing). The backup (The Graph gateway) counts every request against
 * the monthly query quota, so it is only touched when the primary can't be
 * trusted on its own:
 *   - the active URL is already the backup (need the comparison to detect recovery)
 *   - the primary is unreachable / erroring / blockless
 *   - the primary's block number did not advance since the previous poll (silent
 *     stall — Base produces a block every ~2s, so a healthy poll window must advance)
 */
export function shouldProbeBackup(
  primary: Health,
  prevPrimaryBlock: number | null,
  activeIsPrimary: boolean
): boolean {
  if (!activeIsPrimary) return true;
  if (!reachable(primary)) return true;
  return prevPrimaryBlock != null && primary.block! <= prevPrimaryBlock;
}
```

Then replace the existing `refreshActiveUrl` (currently probes both endpoints unconditionally):

```typescript
let lastPrimaryBlock: number | null = null;

/** Re-probe endpoints (backup only when needed) and update the active URL. */
export async function refreshActiveUrl(): Promise<string> {
  if (!BACKUP) {
    activeUrl = PRIMARY;
    return activeUrl;
  }
  const p = await probeHealth(PRIMARY);
  const prevBlock = lastPrimaryBlock;
  if (p.block != null) lastPrimaryBlock = p.block;
  if (!shouldProbeBackup(p, prevBlock, activeUrl === PRIMARY)) {
    activeUrl = PRIMARY;
    return activeUrl;
  }
  const b = await probeHealth(BACKUP);
  activeUrl = chooseUrl(p, b);
  return activeUrl;
}
```

Also update the file's header comment (lines 10–13): change "probe both endpoints' `_meta` block" to "probe the primary's `_meta` block, and the backup's only when the primary looks unhealthy or stalled (the backup is a metered gateway)".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/graphql/subgraphFailover.test.ts`
Expected: all tests PASS (7 existing `chooseUrl` + 5 new).

- [ ] **Step 5: Typecheck, lint, full unit suite**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/graphql/subgraphFailover.ts src/graphql/subgraphFailover.test.ts
git commit -m "feat(subgraph): lazy backup probing to protect Graph gateway query quota"
```

---

### Task 2: Build the subgraph locally

No Docker or RPC required — this only compiles the manifest/WASM for Studio.

**Files:** none in this repo (work happens in the subgraph source checkout).

- [ ] **Step 1: Get the source**

Prefer a fresh clone of upstream so we index exactly what Goldsky runs today:

```bash
git clone https://github.com/aavegotchi/aavegotchi-core-subgraph
cd aavegotchi-core-subgraph
```

If upstream is gone/unreachable, use the archive: local `C:\Cursor\gv2\aavegotchi-core-subgraph` or `git clone https://github.com/robertatkinson3570/gv2` (private; `gh` is already authed).

- [ ] **Step 2: Install and verify toolchain**

```bash
node -v               # expect >= 20
yarn install
npx graph --version   # repo devDependency; expect 0.59.x
```

- [ ] **Step 3: Prepare Base config, codegen, build**

```bash
yarn prepare:base
yarn codegen
yarn build
```

Expected: `build/subgraph.yaml` and `build/**/*.wasm` exist; no compile errors. Sanity-check the generated `subgraph.yaml` (repo root, produced by prepare:base) lists network `base` and the five data-source addresses from the CONTEXT table.

If any script name differs, inspect the repo `package.json` scripts — the equivalents are: mustache-render the base config → `graph codegen` → `graph build`.

---

### Task 3: Subgraph Studio setup — **USER ACTION REQUIRED**

The agent cannot connect a wallet. STOP and give the user these instructions, then wait for the two values back.

- [ ] **Step 1: Print instructions for the user**

> 1. Go to https://thegraph.com/studio/ and connect a wallet you control (this wallet will own the published subgraph; it needs ~$2–5 of ETH **on Arbitrum One** for the later publish tx).
> 2. Click "Create a Subgraph", name it (e.g. `aavegotchi-core-base`), select network **Base**.
> 3. From the subgraph's Studio page copy: (a) the **deploy key**, (b) the **subgraph slug**, (c) the **Studio query URL** shown on the page (form: `https://api.studio.thegraph.com/query/<USER_ID>/<SLUG>/<VERSION>`).

- [ ] **Step 2: Receive from user**: `DEPLOY_KEY`, `SLUG`, `STUDIO_QUERY_URL`. Do not commit these anywhere.

---

### Task 4: Deploy to Studio and wait for sync

**Files:** none.

- [ ] **Step 1: Auth and deploy** (in the subgraph checkout from Task 2)

```bash
npx graph auth --studio <DEPLOY_KEY>
npx graph deploy --studio <SLUG> -l v0.0.1
```

Expected: "Deployed to https://thegraph.com/studio/subgraph/<SLUG>". (graph-cli 0.59 uses the `--studio` flag; if a newer CLI got installed, the equivalent is `graph deploy <SLUG> --version-label v0.0.1`.)

- [ ] **Step 2: Monitor sync**

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}' \
  <STUDIO_QUERY_URL>
```

Sync starts at Base block 33,201,946 (~10 months of history, call-heavy). **Expect hours to a couple of days.** This is a natural checkpoint: stop the session here if needed and resume at Task 5 when `_meta.block.number` is within ~100 blocks of the Goldsky primary's and `hasIndexingErrors` is `false`. If `hasIndexingErrors` becomes `true`, check the Studio logs tab — a deterministic handler error means the source revision differs from what Goldsky runs; try the archived revision from `robertatkinson3570/gv2` instead.

---

### Task 5: Parity verification vs Goldsky

Prove the Studio deployment returns the same data before paying gas to publish.

**Files:** none (throwaway script, run from anywhere).

- [ ] **Step 1: Compare heads and known entities**

Run this (fill in `<STUDIO_QUERY_URL>`):

```bash
node - <<'EOF'
const GOLDSKY = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const STUDIO = "<STUDIO_QUERY_URL>";
const Q = `{ _meta { block { number } hasIndexingErrors }
  aavegotchi(id: "1") { id name kinship level baseRarityScore equippedWearables owner { id } }
  erc721Listings(first: 3, orderBy: timeCreated, orderDirection: desc, where:{cancelled:false, timePurchased:"0"}) { id category priceInWei }
}`;
const hit = (u) => fetch(u, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:Q})}).then(r=>r.json());
const [g, s] = await Promise.all([hit(GOLDSKY), hit(STUDIO)]);
console.log("goldsky block:", g.data?._meta.block.number, "studio block:", s.data?._meta.block.number);
console.log("block delta:", Math.abs(g.data._meta.block.number - s.data._meta.block.number));
console.log("gotchi #1 equal:", JSON.stringify(g.data.aavegotchi) === JSON.stringify(s.data.aavegotchi));
console.log("goldsky listings:", JSON.stringify(g.data.erc721Listings));
console.log("studio  listings:", JSON.stringify(s.data.erc721Listings));
EOF
```

Expected: block delta < ~50; `gotchi #1 equal: true`; listing IDs match (they may differ only if a listing landed between the two block heights — re-run to confirm convergence). Recent-listing IDs matching is the strongest signal the marketplace views will work.

- [ ] **Step 2: Spot-check one heavy app query**

Take a real query the app sends (e.g. the gotchis-by-owner query — grep `src/` for `aavegotchis(` GraphQL documents), run it against both endpoints with a real owner address (e.g. the operator wallet `0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96`), confirm the same result set. Any schema mismatch (field error on Studio while Goldsky serves it) means the source revision drifted — stop and resolve before publishing.

---

### Task 6: Publish to the decentralized network + API key — **USER ACTION REQUIRED**

- [ ] **Step 1: Print instructions for the user**

> 1. On the subgraph's Studio page click **Publish** → network **Arbitrum One** → confirm the wallet tx (cents of gas). **Skip / add 0 GRT curation signal** — the upgrade indexer picks it up regardless.
> 2. After publishing, copy the **Subgraph ID** from the subgraph's Graph Explorer page (thegraph.com/explorer).
> 3. In Studio → **API Keys** → create a key named `gotchicloset-fallback`. On the key's page: **Security → Add Domain**: add `www.gotchicloset.com` and `gotchicloset.com`; and set a **monthly spending cap** (e.g. $5). (The key ships in the public JS bundle — these two settings are the whole defense.)
> 4. Paste back: the Subgraph ID and the API key.

- [ ] **Step 2: Receive from user**: `SUBGRAPH_ID`, `API_KEY`. Construct the gateway URL:

```
https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
```

- [ ] **Step 3: Verify the gateway endpoint answers**

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}' \
  "https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>"
```

Expected: JSON with a block number near Goldsky's head. (If it returns an auth error from a local machine after domain restriction, that's the restriction working — verify before the domain restriction is added, or from the deployed site in Task 8.)

---

### Task 7: Wire the env vars (client + server)

**Files:**
- Modify: `.github/workflows/deploy-autorenew.yml` (the "Sync companion secrets into .env" step, `env:` block ~line 42 and `run:` script ~line 59)
- Modify: `deploy/.env.example` (line 16)
- Modify: `.env.example` (lines 8–11)

- [ ] **Step 1: Add the GH secret (server side)**

```bash
gh secret set SUBGRAPH_URL_BACKUP --body "https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>"
```

- [ ] **Step 2: Extend the deploy workflow's secret sync**

In `.github/workflows/deploy-autorenew.yml`, in the "Sync companion secrets into .env" step, add to the `env:` block (after the `STEWARD_PET_RELAYER_KEY` line):

```yaml
          SUBGRAPH_URL_BACKUP: ${{ secrets.SUBGRAPH_URL_BACKUP }}
```

and add to the `run:` script (after the `SOUL_ENCRYPTION_KEY` sync line), matching the existing `set_var` pattern:

```bash
          # Subgraph failover: The Graph gateway mirror of aavegotchi-core-base.
          # Setting this activates primary->backup retry in server/aavegotchi/subgraphFetch.ts.
          if [ -n "${SUBGRAPH_URL_BACKUP:-}" ]; then set_var SUBGRAPH_URL_BACKUP "$SUBGRAPH_URL_BACKUP"; echo "SUBGRAPH_URL_BACKUP synced (len=${#SUBGRAPH_URL_BACKUP})"; else echo "no SUBGRAPH_URL_BACKUP secret"; fi
```

(Echo the length only, never the value — the URL embeds the API key.)

- [ ] **Step 3: Update the env example comments**

`deploy/.env.example` — replace the bare `SUBGRAPH_URL_BACKUP=` (line 16) with:

```bash
# Backup mirror on The Graph gateway (embeds the API key — set via GH secret
# SUBGRAPH_URL_BACKUP, synced by deploy-autorenew.yml; do not commit a real value):
# https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
SUBGRAPH_URL_BACKUP=
```

`.env.example` — replace the existing backup comment block (lines 8–11) with:

```bash
# Optional: backup subgraph endpoint (The Graph gateway mirror or a self-hosted one).
# Format: https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
# NOTE: this is baked into the public JS bundle — the API key MUST be
# domain-restricted + spend-capped in Subgraph Studio. Empty = no failover.
# When set, the client auto-routes to whichever endpoint is fresh/healthy
# (silent-stall + hard-error failover). See src/graphql/subgraphFailover.ts.
VITE_GOTCHI_SUBGRAPH_URL_BACKUP=
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-autorenew.yml deploy/.env.example .env.example
git commit -m "ci(deploy): sync SUBGRAPH_URL_BACKUP into VPS .env; document Graph gateway fallback"
```

- [ ] **Step 5: Set the Vercel client env — USER ACTION (or CLI if authed)**

Either the user adds `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` = the gateway URL in Vercel dashboard → project → Settings → Environment Variables (Production), **or** the agent runs:

```bash
npx vercel env add VITE_GOTCHI_SUBGRAPH_URL_BACKUP production
# paste the gateway URL at the prompt
```

- [ ] **Step 6: Deploy both halves**

Push `main` (triggers the VPS workflow) and redeploy the Vercel frontend (a push auto-deploys; env-var changes require a fresh deploy to take effect). Watch the workflow log for `SUBGRAPH_URL_BACKUP synced (len=...)`.

---

### Task 8: End-to-end verification

- [ ] **Step 1: Local failover drill (client)**

In a local `.env.local` (gitignored):

```bash
VITE_GOTCHI_SUBGRAPH_URL=https://goldsky-down.invalid/graphql
VITE_GOTCHI_SUBGRAPH_URL_BACKUP=https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
```

(Skip if the key is already domain-restricted and rejects localhost — then rely on Step 3 for failover proof.) Run `npm run dev`, open http://localhost:5000, confirm gotchi/marketplace data loads and the network tab shows requests to `gateway.thegraph.com` succeeding after the primary fails. **Delete `.env.local` afterwards.**

- [ ] **Step 2: Prod steady-state check**

Load https://www.gotchicloset.com, confirm normal function; in the DevTools network tab confirm data requests go to Goldsky only (primary healthy → gateway untouched).

- [ ] **Step 3: Quota sanity after 24–48h**

Studio → API key → usage. Expected: near-zero queries/day in steady state (Task 1's lazy probing working). If it shows ~2k/day-per-open-tab-scale numbers, the lazy probe isn't deployed — investigate before the quota burns.

- [ ] **Step 4: Update the runbook status block**

Edit the STATUS block of `docs/2026-06-20-subgraph-mirror-runbook-local-to-vps.md`: note the Graph-network fallback (this plan) is live, record the subgraph ID (NOT the API key), and that the `*_BACKUP` env vars are now set — so a future agent doesn't build the Docker mirror unnecessarily. Commit:

```bash
git add docs/2026-06-20-subgraph-mirror-runbook-local-to-vps.md
git commit -m "docs(subgraph): record Graph-network fallback as live in mirror runbook"
```

---

## Ongoing (operator notes — not tasks)

- **Schema drift:** if Pixelcraft redeploys Goldsky's subgraph with schema changes, rebuild from the updated source, `graph deploy` a new version, and publish the new version in Studio (small gas, re-syncs). Symptom: gateway queries error on fields the app requests while Goldsky serves them. The Task 5 parity script is the check.
- **Cost:** $0/month steady state; during a real Goldsky outage the gateway serves all traffic — 100k queries free, then $2/100k, bounded by the spend cap.
- **If the DAO later publishes its own** core-base subgraph to The Graph network, consider swapping `SUBGRAPH_ID` to theirs and retiring ours.
