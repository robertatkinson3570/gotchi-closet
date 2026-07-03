# Subgraph Fallback — The Graph Network (LIVE)

**Status: LIVE since 2026-07-02.** GotchiCloset's core subgraph dependency has an automatic
fallback on The Graph decentralized network. If Goldsky (primary) goes down **or silently
stalls**, both the browser client and the VPS server auto-route to our self-published mirror.

Built via `docs/superpowers/plans/2026-07-01-graph-network-subgraph-fallback.md` (full task
history + STATUS there). Supersedes the self-hosted Docker mirror idea in
`docs/2026-06-20-subgraph-mirror-runbook-local-to-vps.md` (never built — this is cheaper: $0/mo
vs ~$60/mo, and The Graph's indexers do the work).

## Live configuration

| Item | Value |
|---|---|
| Primary (Goldsky, unmetered) | `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn` |
| Backup subgraph ID (Graph network) | `GYwfMkWWeD6ZDXQLWd2MkiwwKK16QmsWiUc22GG5kX7U` |
| Explorer page | https://thegraph.com/explorer/subgraphs/GYwfMkWWeD6ZDXQLWd2MkiwwKK16QmsWiUc22GG5kX7U?chain=arbitrum-one |
| Backup endpoint shape | `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/GYwfMkWWeD6ZDXQLWd2MkiwwKK16QmsWiUc22GG5kX7U` |
| API key (`gotchicloset-fallback`) | NOT in this repo. Lives in: Subgraph Studio dashboard (owner wallet), GitHub secret `SUBGRAPH_URL_BACKUP` (full URL), Vercel env `VITE_GOTCHI_SUBGRAPH_URL_BACKUP` (full URL). Key is domain-restricted to `gotchicloset.com`/`www.gotchicloset.com` + monthly spend cap in Studio — required because it ships in the public JS bundle. |
| Studio (deploys, API keys, usage) | https://thegraph.com/studio/subgraph/aavegotchi-core-base (connect owner wallet) |
| Studio dev endpoint (unmetered testing) | `https://api.studio.thegraph.com/query/1756009/aavegotchi-core-base/v0.0.2` |
| Source | `github.com/aavegotchi/aavegotchi-core-subgraph` @ `419026d` (archived: private `robertatkinson3570/gv2`); built with graph-cli 0.59.0, network `base`, first start block 33,201,946 |
| Cost | Free tier 100k queries/month, then $2/100k (Growth), bounded by the Studio spend cap. Steady-state usage ≈ 0 thanks to lazy probing. |

## How the failover works

- **Client** (`src/graphql/subgraphFailover.ts`): every 45s per tab, probes the primary's
  `_meta`. Probes the **backup only when** the primary is unreachable/erroring, its block
  number stopped advancing (silent stall), or we're already failed-over ("lazy probing" —
  protects the metered quota; see quota math below). Routes to the backup when it leads a
  reachable primary by >25 blocks or the primary is down. Per-request hard fallback too.
- **Server** (`server/aavegotchi/subgraphFetch.ts`): no polling; retries the backup once when
  the primary request network-fails or returns non-OK.
- Both are **no-ops if the backup env var is empty** — unsetting `VITE_GOTCHI_SUBGRAPH_URL_BACKUP`
  (Vercel) / `SUBGRAPH_URL_BACKUP` (GH secret) disables the feature cleanly.

**Quota math** (why probing is lazy): naive both-endpoint polling = ~1,920 gateway queries/day
per always-open tab vs a free-tier budget of ~3,333/day — two open tabs would burn the whole
month. Lazy probing spends backup quota only during actual primary trouble.

## Health checks

```bash
# Backup (via gateway; substitute the real key from the GH secret / Studio):
curl -s -X POST -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}' \
  "https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/GYwfMkWWeD6ZDXQLWd2MkiwwKK16QmsWiUc22GG5kX7U"

# Primary (Goldsky):
curl -s -X POST -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } } }"}' \
  https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn

# Real Base chain head, to judge staleness of either (hex result):
curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' https://mainnet.base.org

# Upgrade-indexer status for our deployment (no API key needed):
curl -s -X POST -H 'content-type: application/json' \
  -d '{"query":"{ indexingStatuses(subgraphs: [\"QmaF5BAiJVXYN22j7VoTqJ6JzzTXgL1QEHJ3yck1ghZZdB\"]) { synced health chains { latestBlock { number } chainHeadBlock { number } } } }"}' \
  https://indexer.upgrade.thegraph.com/status
```

Healthy = block number within ~50 of the chain head and `hasIndexingErrors: false`.

## Incident playbook

- **Goldsky down/stalled:** nothing to do — failover is automatic (this happened for real on
  2026-07-01→02: Goldsky froze at block 48,080,274 for 24h+ while the chain advanced ~43k
  blocks). During an incident, real traffic hits the gateway: watch usage in Studio → API key;
  100k queries free, then $2/100k up to the spend cap. Raise the cap if an outage runs long.
- **Gateway erroring** (e.g. `bad indexers: ... Unavailable`): the health probes detect it and
  keep clients on whichever endpoint works; no action needed unless BOTH are down. Seen
  transiently right after publishing (allocation warm-up).
- **Both down:** the app breaks; consider the Studio dev endpoint above as an emergency manual
  swap for `VITE_GOTCHI_SUBGRAPH_URL` (rate-limited, not for sustained prod use).

## Maintenance

- **Schema drift** (Pixelcraft redeploys Goldsky with schema changes — symptom: gateway errors
  on fields the app requests while Goldsky serves them): rebuild from updated source and ship a
  new version:
  ```bash
  git clone https://github.com/aavegotchi/aavegotchi-core-subgraph && cd aavegotchi-core-subgraph
  npx yarn install && npx yarn prepare:base && npx yarn codegen && npx yarn build
  npx graph auth --studio <DEPLOY_KEY-from-Studio>
  npx graph deploy --studio aavegotchi-core-base -l v0.0.3   # bump label
  # wait for sync (took <36h from genesis in 2026-07; version upgrades usually faster),
  # then Studio -> Publish new version (small Arbitrum One gas). Subgraph ID & API key unchanged.
  ```
- **Parity spot-check** (occasionally, or after PC announcements): compare stable entities
  (old sold `erc721Listings`, `itemTypes`, low-ID `aavegotchis`) between primary and backup —
  see the parity script in the plan doc, Task 5.
- **If the DAO publishes its own** core-base subgraph to The Graph network: consider swapping
  the subgraph ID in the two env locations to theirs and deprecating ours (one less thing to
  maintain).

## Known quirks

- The backup **prunes deep history**: time-travel queries (`block: {number: N}`) only work near
  the head. The app uses none — do not add any that must hit the backup.
- Gotchi IDs on Base start at **#3** (no #1/#2).
- Two Studio version labels (`v0.0.1`, `v0.0.2`) point at the same build `QmaF5BAiJVXYN22j7...`
  (an ECONNRESET double-submit during deploy) — cosmetic.
- Scope: failover covers the **core** subgraph only. The app's other three Goldsky subgraphs
  (`src/lib/subgraph.ts`: gotchiverse, GBM, SVG) have no backup yet; same recipe applies.
