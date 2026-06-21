# Subgraph Mirror — Executable Spec & Runbook (Local-First → VPS)

**Date:** 2026-06-20
**Owner:** Grim R (GotchiCloset)
**Type:** Self-contained, agent-resumable runbook. Any agent can start or continue from the
**STATUS** block below. Each phase has explicit **Acceptance** criteria — do not mark a step
done until its Acceptance check passes.
**Why:** GotchiCloset's only subgraph dependency is the official Goldsky **core** Base
subgraph. If it goes down, the app breaks. This builds an independent mirror — **free on the
local PC first**, promoted to an always-on **VPS** only when chosen.
**Companion:** `2026-06-19-aavegotchi-operator-and-subgraph-mirror-strategy.md` (the why/strategy).

---

## STATUS — resume here
- **Phase 0 DONE** — archive at `robertatkinson3570/gv2` (`aavegotchi-core-subgraph` + `MANIFEST.md`).
  Forge art (0.2) deferred (unverified CDN scheme).
- **Phase 1.5 DONE (client + server)** — failover live in both layers, **committed on branch
  `feat/subgraph-failover` (not pushed)**. Client: `src/graphql/subgraphFailover.ts` + `client.ts`.
  Server: `server/aavegotchi/subgraphFetch.ts`, used by `lending/relist.ts` + `companion/gotchiState.ts`.
  Env: `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` + `SUBGRAPH_URL_BACKUP` (empty = no-op today). 12 unit tests pass.
- **Next action:** EITHER Phase 1 local validation slice (install Docker Desktop + WSL2, step 1.0a),
  OR — once a mirror endpoint exists — set the `*_BACKUP` env vars to activate failover. (Also: push
  the branch / open a PR when ready.)
- **Blockers:** Docker Desktop + WSL2 not installed (needed for the Phase 1 local slice).
- _Update this block as work proceeds: set current phase, next action, and any blocker._

## ENVIRONMENT (verified 2026-06-20)
- **Local PC (dev/validation only — sometimes powered off):** Windows, 8 cores,
  **15.5 GB RAM (only ~2.3 GB free with apps open)**, C: **184 GB free**.
  Docker Desktop + WSL2 **NOT installed yet**.
- **Do NOT host the live mirror on the existing Hostinger KVM4 box** — it runs ~28 other
  containers; a backfill spike risks OOM-killing other live products. VPS = a *separate* box.
- **Target box (Phase 2):** Hetzner CPX31 (4 vCPU / 8 GB / 160 GB NVMe, ~€14/mo).

## KEY FACTS (do not re-derive)
- App's only subgraph = Goldsky **core**:
  `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn`
  One subgraph indexes gotchis, wearables, Baazaar, lending, realm **and fakes**.
- Repo: `github.com/aavegotchi/aavegotchi-core-subgraph` (branch **main**).
  Scripts: `prepare:base`, `codegen`, `build`, `create-local`, `deploy-local`, `remove-local`.
  Toolchain: `@graphprotocol/graph-cli@0.59.0`, `graph-ts@0.31.0`.
- `config/base.json` — addresses + **start blocks**:
  | datasource | address | startBlock |
  |---|---|---|
  | core (aavegotchi diamond) | 0xA99c4B08201F2913Db8D28e71d020c4298F29dBF | **33201946** (earliest) |
  | wearable | 0x052e6c114a166B0e91C2340370d72D4C33752B4b | 33202019 |
  | fakeCard | 0xe46B8902dAD841476d9Fee081F1d62aE317206A9 | 33221297 |
  | fakeGotchis | 0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479 | 33221313 |
  | realm | 0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372 | 33969747 |
- Non-subgraph fragile deps: **Forge art** `d1ct2dwqrn0rul.cloudfront.net/shared-assets/images/{id}.png`
  (PC CDN — will die → self-host); **fakes art** = `arweave.net/{hash}` (permanent — use direct,
  never the `dapp.aavegotchi.com` proxy).

---

## PHASE 0 — Archive (free; rebuild-from-zero safety net)
Goal: capture everything off-machine so a PC that's off/dead loses nothing. No VPS.

- [x] **0.1** Cloned `aavegotchi-core-subgraph` into `C:\Cursor\gv2\` (`.git` removed/flattened).
- [~] **0.2** Forge art — **deferred/skipped**: not a current app dep (no Forge usage in `src/`),
  CDN id scheme unverified (`{id}.png` ints 0–500 all 404). Revisit when the baazaar-collections
  feature ships; verify the real URL scheme against the live dapp first.
- [x] **0.3** `C:\Cursor\gv2\MANIFEST.md` written (addresses, start blocks, endpoint, deps).
- [x] **0.4** Pushed to private repo `robertatkinson3570/gv2` (master) — `gv2` was already that
  repo with `aavegotchi/gotchiverse-2d` as upstream; gh authed with `repo` scope.
- **Acceptance:** the private repo contains the core-subgraph source + `forge-assets/` +
  `MANIFEST.md`, and `gotchiverse-2d` is already present. Clone it to a second path and confirm
  it's complete.
- **Cost: $0.**

## PHASE 1 — Local validation (free; prove the pipeline)
Goal: build → deploy → query → parity, locally, on a thin recent slice.

### 1.0 Prereqs
- [ ] **1.0a** Install **Docker Desktop** (bundles WSL2); enable WSL2 backend. Reboot if prompted.
- [ ] **1.0b** `node -v` ≥ 20; `npm i -g @graphprotocol/graph-cli@0.59.0`; have `yarn`.
- **Acceptance:** `docker run hello-world` works; `graph --version` prints 0.59.0.

### 1.1 Local graph-node stack
- [ ] Create `C:\Cursor\gv2\graph-node-local\docker-compose.yml`:
```yaml
version: '3'
services:
  graph-node:
    image: graphprotocol/graph-node:v0.35.1
    ports: ['8000:8000','8020:8020','8030:8030','8040:8040']
    depends_on: [ipfs, postgres]
    environment:
      postgres_host: postgres
      postgres_user: graph-node
      postgres_pass: let-me-in
      postgres_db: graph-node
      ipfs: 'ipfs:5001'
      ethereum: 'base:https://mainnet.base.org'   # free public RPC OK for the slice
      GRAPH_LOG: info
  ipfs:
    image: ipfs/kubo:v0.17.0
    ports: ['5001:5001']
    volumes: ['./data/ipfs:/data/ipfs']
  postgres:
    image: postgres:16
    command: ['postgres','-cshared_preload_libraries=pg_stat_statements','-cmax_connections=200']
    ports: ['5432:5432']
    environment:
      POSTGRES_USER: graph-node
      POSTGRES_PASSWORD: let-me-in
      POSTGRES_DB: graph-node
      POSTGRES_INITDB_ARGS: '-E UTF8 --locale=C'
    volumes: ['./data/postgres:/var/lib/postgresql/data']
```
- [ ] `cd graph-node-local && docker compose up -d`
- **Acceptance:** `docker compose logs graph-node` shows it connected to `base` and is polling
  blocks; no crash loop. (If it errors on `specVersion`/`apiVersion`, bump the graph-node image
  to the latest `graphprotocol/graph-node` tag and retry — see Troubleshooting.)

### 1.2 Build the Base subgraph
- [ ] `cd C:\Cursor\gv2\aavegotchi-core-subgraph && yarn install`
- [ ] `yarn prepare:base` → `yarn codegen` → `yarn build`
- **Acceptance:** `subgraph.yaml` exists with `network: base` and the addresses above; `build/`
  is produced with no errors.

### 1.3 Validation slice (KEY: fast + free)
- [ ] Get current Base head (e.g. `https://mainnet.base.org` `eth_blockNumber`).
- [ ] In `config/base.json` set every `*StartBlock` to **(head − ~50000)**; re-run `yarn prepare:base`.
- [ ] `yarn create-local && yarn deploy-local`
- **Acceptance:** `http://localhost:8030/graphql` (status) shows the subgraph synced to head;
  a query at `http://localhost:8000/subgraphs/name/aavegotchi/aavegotchi-core-matic` returns a
  recent gotchi / Baazaar listing.

### 1.4 Parity check vs Goldsky
- [ ] Run identical queries (a gotchi by id, recent listings, a lending) against your local
  endpoint and the live Goldsky endpoint; diff.
- **Acceptance:** recent entities match field-for-field. **Pipeline proven.**
- [ ] Revert `config/base.json` start blocks to the real values; commit. (Full backfill = Phase 2.)
- **Cost: $0.**

### 1.5 (Optional) Measure real backfill
- [ ] If a free **archive** RPC tier is available, deploy from the true `coreStartBlock 33201946`
  locally and record sync time + RPC calls — so Phase 2 cost is known, not guessed. Else skip.

## PHASE 1.5 — Failover wiring in GotchiCloset (free; ship anytime)
Goal: make the app mirror-ready before a mirror exists.
- [x] Added client env `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` (empty default). _Server-side
  `SUBGRAPH_URL_BACKUP` still TODO._
- [x] Wrapped the client (`src/graphql/subgraphFailover.ts` + `client.ts`): per-request hard
  fallback (`failoverFetch`) **+** ~45s background `_meta` poll (`startHealthPolling`) →
  `chooseUrl` routes to the freshest healthy endpoint (lag > 25 blocks or `hasIndexingErrors`
  = stale).
- [x] **Server:** `server/aavegotchi/subgraphFetch.ts` (shared failover, +4 tests);
  `lending/relist.ts` + `companion/gotchiState.ts` refactored onto it.
- **Acceptance:** ✅ BACKUP empty → behaviour unchanged; ✅ `subgraphFailover.test.ts` (8 tests)
  proves failover when PRIMARY returns a stale `_meta` block / errors / has indexing errors.
- **Cost: $0.**

## PHASE 2 — Promote to VPS (≈€8–14/mo; the only paid phase)
- [ ] **2.1** Provision **Hetzner CPX31** (NOT the Hostinger fleet box). Postgres data dir on a
  **separate attached volume**.
- [ ] **2.2** Copy the Phase 1.1 `docker-compose.yml`; set `ethereum: base:<ARCHIVE_RPC>`
  (Alchemy/QuickNode — free tier may cover backfill).
- [ ] **2.3** Deploy core from true `coreStartBlock 33201946`. Full backfill = hours→days
  (CPU/IO heavy — `nice`/cgroup-cap if needed).
- [ ] **2.4** Parity-check vs Goldsky over a stretch until 1:1.
- [ ] **2.5** Run 24/7; stable domain + TLS → your endpoint URL.
- [ ] **2.6** Set GotchiCloset `*_BACKUP` = your endpoint. After weeks of proven parity+uptime,
  flip yours to **PRIMARY**, Goldsky to BACKUP.
- [ ] **2.7** Point existing **uptime-kuma** at your `_meta` block-lag for free alerts.
- [ ] **2.8** Dependency safety-net: self-host Forge art from `forge-assets/` behind your domain;
  ensure fakes art resolves via `arweave.net/{hash}` directly.
- **Acceptance:** your endpoint serves data identical to Goldsky, stays at head 24/7, and
  GotchiCloset auto-fails-over to it when Goldsky stalls.
- **Cost: ~€8–14/mo + one-time $0–150 backfill RPC.**

---

## Troubleshooting
- **graph-node rejects specVersion/apiVersion:** use the latest `graphprotocol/graph-node` image
  tag; older subgraphs build fine on newer nodes.
- **Backfill crawling / RPC 429s:** public RPC is rate-limited — fine for a slice, not full
  history. Switch `ethereum:` to a paid archive RPC for Phase 2.
- **Low local RAM (2.3 GB free):** close apps before `docker compose up`, or cap Postgres
  `shared_buffers`. Slice indexing is light; full backfill belongs on the VPS.
- **Windows path/line-ending issues:** run the stack and yarn commands inside WSL2, not raw
  PowerShell.

## State by stage
| After | You have | Hot failover? | Cost |
|---|---|---|---|
| Phase 0 | Source + assets archived off-machine; can rebuild | No | $0 |
| Phase 1 | Proven local build/deploy/parity | No (dev only) | $0 |
| Phase 1.5 | App mirror-ready (one env var to flip) | No (slot empty) | $0 |
| Phase 2 | Always-on hot mirror; canonical-by-uptime | **Yes** | ~€8–14/mo |

**Bottom line:** Phases 0–1.5 = ~90% of the resilience (rebuild capability + app ready) for
**$0**. Phase 2 buys zero-downtime hot failover for pocket change, on a separate box, when
chosen. Only gap at $0: if Goldsky dies before Phase 2, you cold-start a backfill (downtime) —
which the €8 box eliminates.
