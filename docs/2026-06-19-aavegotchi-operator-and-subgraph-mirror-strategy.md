# Aavegotchi Operator Strategy & Subgraph Mirror — Spec

**Date:** 2026-06-19
**Author:** Grim R (GotchiCloset) + Claude
**Status:** Strategy + implementation spec (pre-execution)
**Scope:** How GotchiCloset becomes the indispensable, permissionless operator of the Aavegotchi data layer as Pixelcraft exits — starting with a redundant Base subgraph — and the honest limits of the play.

---

## 0. TL;DR

- Aavegotchi is in managed decline: Pixelcraft (PC) is handing leadership to the DAO, Gotchiverse 3D is offline, the dapp/infra is fragile, the treasury is small and shrinking, and the community has **money but "no builders / no do-ers."**
- The data pulled this session says the value is **NOT in the token or treasury** (GHST trades ~3.6× its whole treasury, ~9× hard assets — no NAV trade). The asymmetry is in the **operator/IP position**.
- The play is **builder/infra leverage, not trader leverage**: become the load-bearing operator (dapp + subgraph data layer), hold a modest governance stake, and be the natural party to license the IP / get bought / get a DAO retainer. **Permissionless, cheap, starts now.**
- **First concrete move:** stand up a redundant **Base subgraph mirror** (identical to the official one), run it 24/7, and let reliability make it canonical the moment the official one fails.
- **Infra decision (settled):** do **NOT** co-locate on the current Hostinger box — it's a packed fleet (~28 containers). Use a **dedicated cheap VPS** for the indexer.

---

## 1. Situation (grounded in DAO-call transcripts + on-chain)

Sources: 8 Aavegotchi DAO-call YouTube transcripts (2026-04-19 → 2026-06-18, ingested into the local `gotchi-kb`), the aavegotchi GitHub org, and Base/Polygon RPC reads.

- **PC is exiting**, transferring IP + leadership to the DAO. The IP transfer is **blocked on a proposal nobody has written** (06-06, 06-18 calls).
- **Gotchiverse 3D (GV3D) is offline** (announced 06-15). PC is **open-sourcing Gotchiverse 2D (GV2)**, GV3D to follow.
- **Infra is fragile**: the subgraph layer is effectively maintained by one volunteer ("Dollar Tree status, cheapest way possible"). "One day we could show up and have no dapp."
- **Funding model flipped** to milestone / pay-on-delivery (micro ≈ $2k, medium ≈ $5–10k); inflationary rewards being cut.
- **Stated endgame** (06-06): "grow the IP so the next buyer offers $100M+ or kicks rocks."
- **Community is hyper-allergic to grifters** — the transcripts are wall-to-wall grifter accusations; the "Run it Back" video blow-up shows they savage anyone who looks self-serving.

### On-chain reality (priced 2026-06-19)
- **GHST:** ~$0.0582, market cap ~$2.98M, circ 51.16M (down ~98% from $3.63 ATH).
- **Consolidated treasury** `0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E` (+ rewards `0x8c8E…790f6`): total NAV **~$818k** — ETH 83.1 (~$142k), GHST 9.57M (~$557k), AERO 232,334 (~$111k), USDC ~$6.6k, QUICK 290k (~$2k). Hard (non-GHST) assets **~$262k**.
- **Verdict — no NAV/distribution arb:** GHST trades **~3.6× total treasury** and **~9× hard backing**. Buying GHST to capture the Cohort-2 distribution is **-EV**. The token is priced on IP/brand optionality, not assets.

**Implication:** don't size a GHST position as a value bet. Hold a *modest* stake as a governance/steering tool only. The real upside is operational/IP — pursued by building, not holding.

---

## 2. Strategy — operator leverage, ranked

The asymmetry is in being the indispensable node before anyone notices they need you. Ranked by EV:

1. **Become load-bearing infra (this spec's focus).** Own the canonical front-end (GotchiCloset) **and** the subgraph data layer. Then the DAO, any acquirer, and every holder must route through you. Convert later into a retainer, fees, or a seat in an acquisition.
2. **Accumulate governance cheaply.** 20% quorum = 7.2M GHST (~$419k notional); 10% tier = 3.6M (~$209k). Turnout is dead (a real sig-prop missed quorum at 58.9%). A modest engaged stake + writing/whipping proposals sets the agenda. Capital-cheap; only constraint is GHST liquidity.
3. **License the IP while it's an orphan.** Write the blocked IP-transfer/stewardship proposal; structure a **non-exclusive commercial license** to a builder entity (you) — DAO keeps ownership, you recuse from the vote. Cheap now because the DAO can't use it themselves.
4. **GV2 as demand-gen funnel (phase 2, conditional — see §6).**

### What NOT to do (these detonate the position)
- **No NAV/token trade** — GHST is above book; there's no margin of safety.
- **No tolls on the captive community** — charging users to reach their own on-chain assets invites a free competitor (the contracts + subgraph are public/forkable) and brands you a grifter. Charge **value-add** (premium/SaaS), **B2B API** (other tools), and the **DAO retainer / acquirer** — never the door.
- **No front-running the DAO's announced AERO/QUICK→GHST conversions** — torches the builder credibility that's worth far more.
- **Reputation is the lever.** Accumulate quietly (legal — public info), build openly, recuse from self-benefiting votes.

### Honest base case
**No acquisition ever comes.** Then the operator position is a **small, durable tooling business** (DAO retainer + B2B API + premium SaaS), not a payday — *fine, as long as it stays cheap.* The only failure mode is over-investing (e.g., rebuilding GV2's backend) chasing an exit that never arrives. Acquisition = a free lottery ticket you didn't pay much for.

---

## 3. The Subgraph Mirror — concrete project

### Goal
A **permissionless, always-on, byte-for-byte mirror** of the official Aavegotchi **Base** subgraph(s), pointed at by GotchiCloset (with failover) and offered publicly. It becomes canonical **by uptime** the moment the official one fails — no permission, no vote, no announcement of "takeover."

### Why it works
- The subgraph watches **Base**, not any dapp. It learns about every transaction (from any frontend) by reading new blocks via your RPC, running the mappings, updating its DB. Permissionless and independent.
- The hard part — being ready, synced, reliable — is the part **nobody can block.** Start now so you have months of banked uptime before the crisis.

### What to mirror (NOT 100%)
Mirror the **live Base** subgraphs the dapp actually queries; archive static assets; skip dead legacy Polygon/ETH graphs.

**Mirror (live, Base):**
- `aavegotchi-core-subgraph` ✅ Base — the main index (gotchis, wearables, Baazaar, lending, items). **~80% of need. Start here.**
- `aavegotchi-svg-subgraph` + `aavegotchi-portal-svg-subgraph` — images
- `aavegotchi-baazaar-gbm-subgraph` ✅ Base — auctions
- `aavegotchi-alchemica-subgraph`, `socket-bridge-subgraph`, `aavegotchi-vault-subgraph` — as needed

**Skip (legacy/archived, Polygon/ETH):** `aavegotchi-gotchi-subgraph` [ARCH], `aavegotchi-baazaar-subgraph` [ARCH], `aavegotchi-raffle-subgraph`, `aavegotchi-realm-subgraph`, `aavegotchi-eth-subgraph`, `fundraising-subgraph`, `gltr-staking-subgraph`.

**Archive once (static, not indexed):** `aavegotchi-assets`, `aavegotchi-game-sprites`, `assets`, `brand-kit`, `gotchiverse-bible`.

### Mirror as-is, superset later
- Deploy **identical** manifest + mappings + schema → identical GraphQL → true drop-in. Only `networks.json` (your RPC) and host differ.
- **Later (phase 2):** *extend* — add new entities/fields (**add, never modify**) so the mirror stays a 100% compatible superset.

### Failover design (in GotchiCloset)
A thin GraphQL client wrapper with `PRIMARY` + `BACKUP` URLs. Two triggers because a subgraph fails two ways:
1. **Hard fail** — query errors/timeout/5xx → retry on backup.
2. **Silent stall** (the important one) — it stops advancing but doesn't error. Detect via freshness:
   ```graphql
   { _meta { block { number } hasIndexingErrors } }
   ```
   Compare indexed block to Base chain head. If `lag > ~25 blocks (~1 min)` or `hasIndexingErrors` → treat as dead, route to mirror.
- **Per-request:** try primary → fall to backup on error.
- **Background poll (~30–60s):** check `_meta` on both, cache who's fresh + erroring-free, route new queries to the healthiest.
- Net rule: **always route to the freshest healthy endpoint.** Mirror goes live automatically the instant it's the better of the two.

### Sync model
A deployed subgraph on a *running* graph-node follows the head automatically (ingests each new block). **Do not "daily sync"** — a stale mirror needs a multi-hour catch-up exactly when you need it, and serves wrong data meanwhile. Keep it **hot**. Cost is in the one-time **backfill**, not steady-state (head-following is a trickle).

---

## 4. Infrastructure & cost

### DO NOT co-locate on the current box
Hostinger **KVM 4** (`srv1360330`, 4 vCPU / 16 GB / 200 GB NVMe) is a **packed fleet** — ~28 containers: Elasticsearch, TimescaleDB, **7× Postgres**, **4× Redis**, Temporal, a Celery stack, + ~8 app backends (AuditKit, SiteCrawlIQ, CloakShare, DataReconIQ, Agentergon, Postiz, distribution-engine, autopulse, Hermes…). Only **92 GB disk free**; RAM clearly contended. A backfill spike could **OOM-kill a dozen other live products** to save ~$8/mo. Not worth it.

### Dedicated indexer box — recommended spec
graph-node + Postgres + IPFS; NVMe is non-negotiable (I/O-bound).

| Tier | Spec | Use | ~Cost |
|---|---|---|---|
| **Recommended** | **4 vCPU / 8 GB RAM / 160 GB NVMe** (Hetzner **CPX31**) | core + a few Base subgraphs, room to grow | ~€14/mo |
| Minimum (core only) | 4 GB / 80 GB NVMe (Hetzner CPX21) | core only, tight — will outgrow disk | ~€8/mo |
| Full suite | 8–16 GB / 200 GB NVMe | all Base subgraphs + gotchiverse-base build | ~€20–30/mo |

**Provision tips:**
- Put the **Postgres data dir on a separate attached volume** so you can grow disk without rebuilding.
- The core subgraph DB will grow into tens of GB over time — size disk for growth, not today.
- Backfill faster with more CPU + a good **Base archive RPC**; throttle steady-state RPC after.
- Free monitoring: you already run **uptime-kuma** — point it at the new indexer's `_meta` endpoint for block-lag alerts.

### Cost summary
- **Recurring:** ~€8–14/mo (dedicated box) + RPC (free tier likely covers head-following; paid only if heavy).
- **One-time backfill:** ~$0–150 (RPC; may fit free credits) + hours-to-days of sync. **The heavy part.**
- **Real cost = ops time:** graph-node is finicky; **re-syncs on every schema/version bump** (full re-index). Per-subgraph costs scale ~linearly → start with core only.

---

## 5. Reference — addresses, endpoints, repos

### Live Base endpoint to mirror (Goldsky)
```
https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
```
Project `project_cmh3flagm0001r4p25foufjtt`. Sibling slugs (verify): `aavegotchi-portal-svgs-base`, `aavegotchi-alchemica-base`, `aavegotchi-xp-base`, `socket-bridge-base` — all `…/prod/gn`.

### Base (8453) core contracts (from official `deployed-contract-addresses`)
```
aavegotchi diamond  0xA99c4B08201F2913Db8D28e71d020c4298F29dBF
wearable diamond    0x052e6c114a166B0e91C2340370d72D4C33752B4b
forge               0x50aF2d63b839aA32b4166FD1Cb247129b715186C
GBM / Baazaar       0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31
GHST                0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB
FAKE Gotchis Cards  0xe46B8902dAD841476d9Fee081F1d62aE317206A9
FAKE Gotchis Art    0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479
Guardian Skins      0x898d0F54d8CF60698972a75be7Ea1B45aAb66e59
Guardian Profile    0xdc27a8BF85508387cB8c3B97BA77f3941eDFF45f
```

### Base (8453) Gotchiverse / alchemica — for building the Base gotchiverse subgraph (the gap)
```
REALM Parcels       0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372
Installations       0xebba5b725A2889f7f089a6cAE0246A32cad4E26b
Tiles               0x617fdB8093b309e4699107F48812b407A7c37938
FUD / FOMO / ALPHA / KEK   0x2028…0fF4 / 0xA321…4b58 / 0x15e7…1947 / 0xE52b…a0e5
GLTR (Base)         0x4D140CE792bEdc430498c2d219AfBC33e2992c9D
```
Maps 1:1 to Polygon: Realm `0x1d0360…`→`0x4B0040…`, Installations `0x19f870…`→`0xebba5b…`, Tiles `0x9216c3…`→`0x617fdB…`.

### Treasury / governance (on-chain, public)
```
Consolidated treasury  0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E
Rewards wallet         0x8c8E076Cd7D2A17Ba2a5e5AF7036c2b2B7F790f6
(old treasury safe)    0x939b67F6F6BE63E09B0258621c5A24eecB92631c  (~empty)
```

### Key repos (github.com/aavegotchi)
- `aavegotchi-core-subgraph` (Base core — mirror this first), `gotchiverse-subgraph` (Polygon — port to Base), all sibling `*-subgraph` repos
- `graph-node-dev`, `graph-polygon-docker` — docker harness for self-hosting graph-node
- `deployed-contract-addresses` — canonical address list (README, `## Base` section)
- `gotchiverse-2d` — GV2 client (see §6)

---

## 6. GV2 / Gotchiverse — conditional, phase 2

- **`github.com/aavegotchi/gotchiverse-2d`** is **published** (2026-06-18, 151 MB) — a full Next.js + Phaser **client**. Boots with `yarn dev`.
- **Gate 1 — it's the CLIENT only.** README: *"no separate server package in this public repo"*; farming/economic core is server-authoritative and **the backend is not published.** Reviving the full game = **building the backend** (most of a farming game). The Chisel/GHSTMiners precedent: open-sourced game, empty data, dead API → unrunnable.
- **Gate 2 — no LICENSE.** Currently source-available / all-rights-reserved despite "open sourcing." **Don't build a business on it until a real license exists.**
- **GV2 is Polygon; Base contracts exist** (§5) but **no public Base gotchiverse subgraph is published** → a clean gap to fill.
- **Recommendation:** game-as-**funnel**, not game-as-business. Don't solo-operate a live-service money-pit (the DAO's fatal pattern). *If* a fun slice runs client-only and cheap (explore/combat/social — there's a `.env.combat.env`), host it to drive players to GotchiCloset + your data layer. Fund it as a **milestone DAO proposal** (high-goodwill, ecosystem-wide), not your burn. **After** the operator position is locked.

---

## 7. Next steps (do-list)

1. **Provision** the dedicated indexer box (Hetzner CPX31-class, Postgres on a separate volume).
2. **Stand up** graph-node + Postgres + IPFS (`graph-node-dev` docker harness).
3. **Read the manifest** of `aavegotchi-core-subgraph`: start block + datasources → exact backfill cost/RPC needs.
4. **Clone + deploy** core as-is, networks.json → your Base archive RPC → backfill.
5. **Parity-check** vs the official Goldsky endpoint for a stretch.
6. **Wire failover** into GotchiCloset (`_meta` freshness, primary/fallback) — shippable today, independent of the box.
7. **Publish** the endpoint as a public community redundancy; point uptime-kuma at its `_meta`.
8. **Later:** add svg + baazaar-gbm; build the **gotchiverse-base** subgraph (the gap); extend core as a superset.

---

## 8. Risks / honest caveats

- **Operator ≠ owner.** Running infra makes you the access layer, not the brand. IP (separate proposal) and protocol/treasury (governance) are distinct. Last-infra-standing is the *position from which* you acquire them, not the acquisition.
- **A funded buyer can route around you** by taking the IP + rebuilding a front-end. Your moat (incumbency + no-do-er vacuum) holds against slow death, not against money + brand. In that case the play flips to "get bought/hired as the operator" — a win only if you're genuinely load-bearing.
- **Ops burden is the real cost** — re-syncs on every subgraph version bump; don't martyr yourself on unpaid infra forever — convert to a retainer once load-bearing.
- **Grifter radar.** Build openly, recuse from self-benefiting votes, never toll the community. Reputation is the asset that makes all of this possible.
- **Captions caveat:** the DAO-call source data is YouTube auto-captions (accurate on substance, no speaker labels, occasional misheard names).
