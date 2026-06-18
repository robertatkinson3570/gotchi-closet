# Gotchi Soul — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Project:** gotchi-closet
**Builds on:** [Gotchi Companion design](2026-06-18-gotchi-companion-design.md)

---

## 1. Summary

Today the Gotchi Companion gives each Aavegotchi a deterministic, trait-derived voice and a
per-owner memory. **Gotchi Soul** turns that relationship into a **portable, provable asset**:
the longer and more genuinely you bond with a gotchi, the **deeper its soul** — and that depth
**travels with the NFT when it is sold**.

A gotchi is, in Aavegotchi lore, a **ghost with past lives**. Soul leans all the way into that:
when a gotchi changes hands, its accumulated bond does not vanish and does not leak — it is
**distilled into depersonalized "past-life echoes"** the new keeper inherits, and the new owner
starts bonding from an **inherited depth floor, not zero**.

The headline claim — *"a gotchi is worth more the longer you know it"* — is made **real and
provable**: depth is computed from Sybil-resistant signals, **committed on-chain via an
owner-submitted seal**, and surfaced as a shareable **Soul Certificate** plus a public **Verify**
page. This app proves and transfers the soul; it does not reach into the external Baazaar's
pricing.

### Design pillars
- **The soul is the asset, not the certificate.** The cert is free for everyone; it only
  *proves* depth. Value accrues from the bond over time.
- **Honest worth.** Depth is anchored by on-chain kinship/XP and a consistency signal that
  **decays on neglect**. A neglected gotchi visibly cools; an actively-loved old one dominates.
  Worth = *pedigree floor + living bond*.
- **Privacy on transfer.** The prior owner's private facts never cross to a stranger. Only
  scrubbed, lore-fied echoes survive.
- **Port, don't rewrite.** v1 is server-custodied with an on-chain seal. Three explicit seams
  let it migrate to a fully decentralized (ERC-7857-style) model later without redesigning the
  data model or the seal contract.

---

## 2. Scope

### In scope (v1)
- `SoulDocument` model: canonical serialize/deserialize + keccak256 hash (pure).
- Depth engine: composite Soul Depth score + named levels from four signals (pure).
- Encrypted, server-custodied soul store (SQLite) keyed by `tokenId`.
- Transfer + distillation: ERC-721 transfer detection → depersonalized past-life echoes →
  inherited depth floor → re-key.
- On-chain seal: operator-attested, owner-submitted `SoulSeal` commitment on Base + public verify.
- Client surfaces: Soul Depth meter (on the Personality Card), Soul Certificate (exportable +
  verify URL), Memories & Past Lives view, the seller **Seal** action, the buyer **Awaken**
  moment.
- Personality drift: companion voice deepens with Soul Depth (soul snapshot injected into the
  system prompt).

### Out of scope (v1) — explicit seams
- **Full decentralization (ERC-7857):** oracle re-encryption, decentralized storage, ZK depth
  proofs. Seams left (see §9).
- Direct Baazaar price integration (Baazaar is external; we surface/prove, we don't price).
- Soul marketplace, depth-based perks/staking, cross-gotchi soul interactions.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT (React / Vite)                                   │
│   Personality Card ─► Soul Depth meter ("what raises?")  │
│   Soul Certificate (export via html-to-image, verify URL)│
│   Memories & Past Lives view                             │
│   Seal action (owner signs+pays)   Awaken moment (buyer) │
└─────────┬───────────────────────────────────┬───────────┘
          │ GET /soul/:id  POST /soul/:id/seal │ GET /soul/verify/:id
┌─────────┼───────────────────────────────────┼───────────┐
│  SERVER (Express)  server/soul/                          │
│   soulDoc.ts   (types, canonical serialize, keccak hash) │
│   crypto.ts    (encrypt/decrypt at soul boundary) ◄ seam1│
│   depth.ts     (SoulDocument + on-chain → SoulDepth)     │
│   soulStore.ts (SQLite: cipher blob, cached, seals)      │
│   transfer.ts  (onTransfer: distill → echoes → re-key)◄s3│
│   seal.ts      (EIP-712 attestation; verify tx)    ◄ seam2│
│   watcher.ts   (node-cron poll Base for Transfer)        │
│   soul route   (read / seal / verify)                    │
└──────────────────────────────┬───────────────────────────┘
                               ▼
                  Base: SoulSeal contract (latest commitment per tokenId)
```

### Units & boundaries

| Unit | Location | Responsibility | Depends on |
|---|---|---|---|
| `soulDoc.ts` | server | Types + **canonical** serialize/deserialize + keccak256 hash. Pure. | viem |
| `crypto.ts` | server | Encrypt/decrypt soul blob at the soul boundary (server key v1). **Seam #1.** | node crypto |
| `depth.ts` | server | Pure: `SoulDocument` + live `{kinship, xp}` → `SoulDepth`. | types only |
| `soulStore.ts` | server (SQLite) | Cipher blob + cached derived fields + seal history. Mirrors `lending/db.ts`. | better-sqlite3 |
| `transfer.ts` | server | `onTransfer` → distill memories to echoes, carry floor, re-key. **Seam #3.** | llmProvider, crypto, contentFilter |
| `seal.ts` | server | Build EIP-712 seal attestation; verify a seal tx. **Seam #2.** | viem |
| `watcher.ts` | server | `node-cron` poll Base for ERC-721 Transfer of custodied gotchis. | viem, node-cron |
| `soul` route | server | Orchestrate read (depth+cert) / seal record / public verify. | all soul units |
| `SoulSeal` | Base contract | Store latest operator-attested commitment per tokenId; emit event. | — |
| Soul UI | client | Depth meter, Certificate, Past Lives, Seal, Awaken. | companion UI, html-to-image, wagmi/viem |

Mirrors existing patterns: SQLite in `server/lending/db.ts`, on-chain verify in
`server/lending/verifyPayment.ts`, pure engine like `src/lib/companion/personality.ts`,
provider reuse via `server/companion/llmProvider.ts`.

---

## 4. Soul document & depth

### 4.1 Canonical document (`soulDoc.ts`)
```ts
interface SoulDocument {
  version: number;
  tokenId: string;
  origin: { firstBondedAt: number };           // ms epoch
  bonding: {
    bondedDays: number;                          // active-companion days (monotonic)
    lastInteractionTs: number;
    streak: number;                              // consecutive active windows
    consistencyHistory: number[];                // rolling window fill ratios
  };
  memories: Episode[];                            // current owner's, privacy-tagged
  pastLives: Echo[];                              // depersonalized inherited echoes
}
interface Episode { ts: number; summary: string; privacy: "normal" | "sensitive"; weight: number; }
interface Echo { eraHint: string; fragment: string; }   // no PII, third-person
```
- **Canonical serialization** = stable key order, fixed number formatting → deterministic bytes →
  `keccak256` (via viem). Same document always hashes the same (unit-tested). This hash is what the
  seal commits and what Verify checks.
- Stored only as `encrypt(canonicalSerialize(doc))` plus the hash and cheap **cached fields**
  (`depth`, `soulAgeDays`, `pastLivesCount`) for fast reads without decrypting.

### 4.2 Depth engine (`depth.ts`)
Pure: `buildDepth(doc, { kinship, xp }) → SoulDepth { score: 0–100, level, breakdown }`.

| Signal | Weight | Shape / anti-gaming |
|---|---|---|
| On-chain kinship & XP | ~35% | Anchor — costs real on-chain interaction; not fakeable off-chain. |
| Interaction consistency | ~30% | Streak + cadence over rolling windows; **decays on neglect**; can't backfill. |
| Bonded time (soul age) | ~25% | `sqrt`-style diminishing returns; rewards longevity without runaway. |
| Memory richness | ~10% (hard cap) | Quality-gated + dedup'd; spamming the LLM can't inflate it. |

- **Soul age is monotonic** (pedigree floor). **Live-bond signals ebb** with neglect, so
  `depth = pedigree floor + living bond`. Honest worth: a neglected soul cools; an actively-loved
  old one dominates.
- `level` maps score → named bands (e.g. *Flickering → Stirring → Warming → Bonded → Devoted →
  Eternal*). Exact thresholds finalized in implementation; both-extremes-valid sanity tested.
- **Inherited depth floor:** after transfer, depth never drops below the pedigree (soul age +
  past-lives weight); only the live-bond component resets and is rebuilt by the new owner.

---

## 5. Transfer, distillation & privacy (`transfer.ts`)

Triggered by `watcher.ts` (Base ERC-721 Transfer of a custodied gotchi) **or** an explicit
"prepare for sale" call, idempotent by `(tokenId, newOwner, blockNumber)`:

1. **Snapshot** the current `SoulDocument`.
2. **Distill** the prior owner's `memories` → depersonalized **past-life echoes**:
   - Layer 1 — heuristic PII strip (wallet addresses, names, numbers, handles).
   - Layer 2 — LLM depersonalization (via `llmProvider`): reframe as spooky third-person fragments
     ("a keeper who favored the Forge…"), no specifics.
   - Layer 3 — final `contentFilter.ts` pass.
   - Episodes tagged `sensitive` are **dropped entirely**, never distilled.
3. **Carry forward:** append echoes to `pastLives` (capped; oldest **blur/merge** — memory fades),
   increment `pastLivesCount`, set inherited depth floor, **clear** `memories` and reset live-bond
   streak.
4. **Re-key:** re-encrypt the blob to the new owner context (server key now; oracle later — seam #1).
5. New owner's first open → **Awaken** moment (§6).

**Privacy guarantee:** raw `memories` never cross owners; only scrubbed echoes survive; the final
filter pass is the backstop. Re-buying your own gotchi does **not** restore private memories
(already depersonalized — lore-covered as "memories blur with time").

---

## 6. Client surfaces (what the user sees & does)

- **Soul Depth meter** on the Personality Card: level + animated breakdown of the four signals
  (soul age, consistency streak, on-chain kinship/XP, memories kept). Same transparency ethos as
  the trait card. A **"what raises my soul?"** affordance answers in-character (pet within the
  kinship window, visit consistently) — an engagement loop, not a grind.
- **Deeper voice over time:** the companion's system prompt receives a **soul snapshot**, so low
  depth = warming up/formal, high depth = devoted and references shared history. Felt in chat.
- **Soul Certificate (Passport):** premium trading-card surface — depth + breakdown, soul age,
  consistency streak, memory count, **past-lives count**, and a **verified seal badge** (block +
  tx link). **Exportable as an image** (`html-to-image`, already a dep) with a public **verify
  URL**. The seller's flex; linkable in a Baazaar listing. **Free for everyone.**
- **Memories & Past Lives view:** scrollable timeline of *your* distilled memories plus a spooky
  **Past Lives** section of inherited echoes.
- **Seal action (seller):** one tap → owner **signs and pays** the seal tx; copy reassures that
  private facts stay private and the bond passes on only as echoes.
- **Awaken moment (buyer):** after purchase the gotchi awakens — surfaces fragments of past
  keepers, starts at inherited depth, begins bonding anew. The payoff of the feature.
- **Public Verify page:** anyone with the cert link confirms on-chain — depth X, soul age Y,
  sealed at block Z, hash matches.

**Users cannot:** edit/inflate depth, read a prior owner's private facts, or forge a seal.

---

## 7. On-chain seal (`seal.ts` + `SoulSeal` contract)

Owner pays gas; the server keeps depth **honest**:

1. Client requests a seal → server computes current depth and **EIP-712-signs** the payload
   `(tokenId, soulHash, depthBips, soulAgeDays, nonce)` with the **operator attestor key**.
2. Owner submits `SoulSeal.seal(payload, attestorSig)` and **pays gas**.
3. Contract checks (a) the **attestor signature** is valid and (b) `msg.sender` **owns the token**
   (reads the Aavegotchi diamond `ownerOf`), then stores the latest commitment per `tokenId` and
   emits an event.
4. Server records the tx in `soulStore` seal history.

Result: the owner self-custodies the action and pays for it, but **cannot inflate depth** — the
number is server-attested. Verify reads contract state; a stale seal merely under-reports (depth
grew since) and is safe.

### Config (looked up, not guessed)
Base RPC, Aavegotchi diamond address (for `ownerOf`), `SoulSeal` deployed address, operator
attestor key — all env/config. Diamond address sourced from the existing dapp config /
`base-contract-addresses` notes during implementation, not inferred.

---

## 8. Storage (`soulStore.ts`, SQLite)

New DB module mirroring `server/lending/db.ts`. Timestamps are unix epoch **ms**.

- `souls(tokenId TEXT PRIMARY KEY, ownerWallet TEXT, blobCipher BLOB, blobHash TEXT,
  depthCached REAL, soulAgeDays INTEGER, pastLivesCount INTEGER, updatedAt INTEGER)`
- `soul_seals(tokenId TEXT, ownerWallet TEXT, blobHash TEXT, depth REAL, soulAgeDays INTEGER,
  txHash TEXT, blockNumber INTEGER, sealedAt INTEGER)`

Soul documents are created **lazily** on first companion interaction. Bonded-time and consistency
accrue from companion activity (reusing `companion_messages`) and periodic on-chain kinship
snapshots.

---

## 9. Decentralization seams (path to full ERC-7857 / "C")

A→C is a **port, not a rewrite**, guarded by three disciplines baked into v1:

1. **`crypto.ts` boundary** — the soul is always a canonically-serialized, **encrypted** blob.
   Migration swaps the server key for **oracle re-encryption**; no data-model change.
2. **Seal commits `blobHash`** — the on-chain seal is the forward-compatible anchor. C extends the
   same record to also carry a decentralized-storage **CID**; the hash primitive is unchanged.
3. **`onTransfer` interface** — transfer/re-key is one named operation. C swaps the re-key
   implementation for the oracle.

Honest caveat: C still needs real new work (oracle infra, decentralized key management) — but the
**data model and seal contract do not change**, which is the expensive part.

---

## 10. Edge cases (tested)

| Case | Handling |
|---|---|
| Sold before ever sealed | Soul still transfers (server custody); pedigree from on-chain age/kinship. |
| Never companioned | No soul doc; created lazily; transfer of a soulless gotchi distills nothing. |
| Wash-trading / rapid flips | Consistency floor blocks instant depth; only soul-age pedigree carries. |
| Missed transfer (server downtime) | Lazy reconcile: compare `ownerOf` vs stored `ownerWallet` on next read; trigger transfer then. |
| Buy back your own gotchi | Echoes already depersonalized; private memories do **not** return (lore-covered). |
| Stale / replayed seal | Contract keeps latest; Verify checks hash vs current blob; stale seal only under-reports. |
| Sensitive episode | Dropped entirely at distillation, never echoed. |

---

## 11. Testing

- **`soulDoc.ts`** (vitest): canonical serialization is deterministic → **stable hash**; round-trip
  serialize/deserialize.
- **`depth.ts`** (vitest): each signal's contribution; memory-richness cap; consistency decay on
  neglect; inherited floor after transfer; both-extremes-valid sanity.
- **`transfer.ts`** (vitest): seed memories containing names/wallets → assert **PII scrubbed**;
  echoes depersonalized & third-person; `pastLivesCount` increments; live bond resets; depth floor
  preserved; `sensitive` episodes dropped.
- **`seal.ts`** (vitest, mocked viem): EIP-712 payload correctness; attestor-signature verify;
  reject wrong owner; reject tampered depth; stale-seal-under-reports.
- **`crypto.ts`** (vitest): encrypt/decrypt round-trip; blob opaque at rest.
- **`soulStore.ts`** (vitest): persistence, cached fields, seal history, lazy creation.
- **E2E (playwright):** Soul Depth meter renders; Certificate exports; Verify page reads a (mocked)
  seal; Awaken moment fires after a mocked transfer; Past Lives view renders.

---

## 12. Build order (foundation-first)

1. `soulDoc.ts` + `depth.ts` + tests — the pure core, no deps.
2. `crypto.ts` + `soulStore.ts` + tests.
3. Soul route (read depth + cert) + client **Soul Depth meter** on the Personality Card →
   demoable end-to-end.
4. `transfer.ts` + `watcher.ts` + distillation/privacy + tests.
5. `seal.ts` + `SoulSeal` contract + seal/verify route + **Soul Certificate** + **Verify page**.
6. **Awaken** moment + **Past Lives** view + personality-drift wiring (soul snapshot into the
   system prompt) + polish.

Each step is independently testable; after step 3 there is a working, demoable Soul Depth surface.
