# Plan 006: Gasless daily petting (revive the daily loop, operator-relayed, zero-tap)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: confirm the reuse targets still exist and match: `server/lending/relist.ts` (`initWallet`, viem `writeContract` pattern), `server/lending/cron.ts`, `src/lib/lending/contracts.ts` (`AAVEGOTCHI_DIAMOND_BASE`), `server/routes/*.ts` (Express route style), `server/companion/db.ts` (better-sqlite3 store style). On any mismatch, compare to the excerpts below before coding.

## Status
- **Priority**: P1 (highest-leverage retention feature; the daily loop is the one thing the community keeps asking for)
- **Effort**: M
- **Risk**: LOW (additive; operator can only pet, never transfer or sell)
- **Depends on**: existing relayer infra (`server/lending`)
- **Category**: feature / growth
- **Planned at**: 2026-06-21

## Why this matters
Petting (`interact`) is Aavegotchi's core daily habit: it raises a gotchi's kinship and is the reason players opened the app every day. It is **not implemented in gotchi-closet or gv2 at all** today. The habit is verifiably dead on-chain: sampled gotchis last interacted around 2025-08 (e.g. coderdan #1484, Mia #10138) with kinship frozen. Reviving it as a **one-time-approve, then zero-tap gasless** loop is the cheapest, stickiest growth lever available, and gotchi-closet already has every piece needed (the diamond is wired, and a funded Base relayer + cron already run for lending auto-relist).

Sensitivity note: enrollment is **opt-in only**. Some frozen gotchis are memorials (a DAO director, gotchi #13700 "HARDKOR", passed away in 2026; the 2026-06-07 DAO call references the succession). Never auto-enroll anyone's gotchis; only pet what the owner explicitly opts in.

## Verified on-chain facts (Base, traced 2026-06-21)
Chain: Base (8453). aavegotchiDiamond: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`. All selectors confirmed present via DiamondLoupe `facetAddress`:

| Function | Selector | Notes |
|---|---|---|
| `interact(uint256[] _tokenIds)` | `0x22c67519` | Pets; raises kinship. **12h cooldown per gotchi.** Callable by owner OR an approved pet operator. |
| `setPetOperatorForAll(address _operator, bool _approved)` | `0xcd675d57` | Owner one-time approval letting the relayer pet all their gotchis. |
| `isPetOperatorForAll(address _owner, address _operator) view returns (bool)` | `0xd7358fea` | Verify approval before each run. |
| `kinship(uint256 _tokenId) view returns (uint256)` | `0xf5b91852` | Read kinship for UI. |
| `getAavegotchi(uint256) view returns (AavegotchiInfo)` | `0x37c1d569` | Struct includes `lastInteracted`, `kinship`, `status` (3 = summoned), `owner`. Use to gate cooldown. |
| `executeMetaTransaction(address,bytes,bytes32,bytes32,uint8)` | `0x0c53c51c` | Supported; enables optional one-tap signed petting (v1, see below). |

Security property worth stating: a pet operator can ONLY call `interact`. It cannot transfer, sell, list, or unequip. So the relayer hot wallet's blast radius is effectively zero even if the key leaks. This is why gasless petting is safe to ship.

## Reusable infra (verified against live code)
- `server/lending/relist.ts:18-26` — the relayer pattern to copy verbatim:
  ```ts
  export function initWallet() {
    const key = process.env.AUTORENEW_HOT_WALLET_KEY;       // use a SEPARATE PET_RELAYER_KEY (see Scope)
    if (!key) return false;
    const account = privateKeyToAccount(key as `0x${string}`);
    operatorAddress = account.address;
    walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
    publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
    return true;
  }
  ```
- `server/lending/relist.ts:65-73` — the write shape to copy for `interact`:
  ```ts
  const hash = await walletClient.writeContract({
    address: AAVEGOTCHI_DIAMOND_BASE as `0x${string}`,
    abi: PET_FACET_ABI, functionName: "interact", args: [tokenIds],
    chain: base, account: walletClient.account!,
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  ```
- `server/lending/cron.ts` — calls `initWallet()` then schedules the relist loop; add a pet loop alongside it.
- `server/aavegotchi/subgraphFetch.ts` + the `gotchiLendings` query style in `relist.ts:39-45` — copy for an "owner -> tokenIds" query.
- `AAVEGOTCHI_DIAMOND_BASE` is exported from both `src/lib/lending/contracts.ts:5` and `server/lending/abi.ts`.
- DB store style: `server/companion/db.ts` (better-sqlite3, prepared statements). Tests: `vitest`. Client writes: `wagmi` v3 `useWriteContract` + `viem`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npx vitest run server/pet` | all pass |
| Lint | `npx eslint . --ext ts,tsx` | exit 0 |
| Verify selectors (sanity) | re-run the `facetAddress` check from this plan against `mainnet.base.org` | all SUPPORTED |

## Architecture (v0: opt-in, then zero-tap, gasless)
1. **User opt-in (one tx):** in the gotchi-closet UI, the user clicks "Enable gasless auto-pet" which sends `setPetOperatorForAll(PET_RELAYER_ADDRESS, true)` via wagmi. This single approval costs the user a few cents of Base gas (or sponsor it later via a paymaster; out of v0 scope). The backend then verifies on-chain `isPetOperatorForAll(owner, relayer) == true` before recording the opt-in (so no spoofed enrollments).
2. **Relayer cron (gasless for the user):** every ~12h, for each opted-in owner:
   - fetch their summoned gotchi tokenIds (subgraph),
   - re-check `isPetOperatorForAll(owner, relayer)` on-chain; skip + auto-disable if revoked,
   - filter to gotchis where `now - lastInteracted >= 12h` and `status == 3`,
   - `interact([tokenIds])` in batches (cap ~50 ids/tx),
   - relayer pays gas (cents). Log results.
3. **UI:** per-gotchi kinship + last-petted + cooldown countdown; the enable/disable toggle; a streak indicator. Optional "Pet now" button that calls `interact` from the user's own wallet (non-gasless fallback for non-opted-in users).

### v1 (optional, later): one-tap signed, no operator
For users who will not grant operator: have them sign an EIP-712 message and submit `executeMetaTransaction` (selector `0x0c53c51c`, supported) wrapping `interact`; relayer pays gas. More friction per day than operator mode; do not build in v0.

### Channeling note (out of scope here, for context)
The realmDiamond does NOT support `executeMetaTransaction` and has no pet-operator equivalent, so gasless channeling needs ERC-4337 + a Base paymaster or parcel access-rights delegation. Petting is the clean first win precisely because of the operator pattern; channeling is a separate plan.

## Scope
**In scope:**
- `server/pet/abi.ts` — `PET_FACET_ABI` with the 6 fragments above (verified signatures).
- `server/pet/petBot.ts` — `initPetWallet()` (copy `relist.ts`, key `process.env.PET_RELAYER_KEY`), `dueGotchisForOwner(owner)`, `petOwner(owner)`, `petAllOptedIn()`.
- `server/pet/db.ts` — better-sqlite3 store: table `pet_optins(owner TEXT PRIMARY KEY, enabled INTEGER, created_at INTEGER, last_run_at INTEGER)`, optional `pet_log(owner, token_id, tx_hash, ts)`.
- `server/routes/pet.ts` — `POST /api/pet/optin`, `POST /api/pet/optout`, `GET /api/pet/status`, optional `POST /api/pet/now`. Wire into the Express app where other routes mount.
- `server/lending/cron.ts` — add a 12h pet loop calling `petAllOptedIn()` (guard behind `PET_RELAYER_KEY` presence).
- Client: `src/hooks/useGotchiKinship.ts` (read kinship/lastInteracted) and a `PetPanel` / additions to `src/components/explorer/GotchiActionsPanel.tsx` with the wagmi `setPetOperatorForAll` write + status display.
- `PET_RELAYER_ADDRESS` constant (derived from the key) shared client/server.

**Out of scope:** channeling/claiming gasless, paymaster-sponsored approvals, the meta-tx v1 path, any revenue mechanic (note for later: a cosmetic "pet pass" upsell ties to the rise-from-ashes playbook, but not now).

## Data + safety
- **Opt-in only.** Never pet a gotchi whose owner is not in `pet_optins` with `enabled=1` AND not currently `isPetOperatorForAll==true` on-chain.
- **Use a dedicated `PET_RELAYER_KEY`** (separate low-balance Base hot wallet), not the lending `AUTORENEW_HOT_WALLET_KEY`, so the two jobs are isolated. Document it in the deploy env.
- **Idempotency:** the 12h cooldown filter prevents double-petting; safe to re-run.
- **Caps:** max batch size (~50 ids), max gotchis/run, per-run gas ceiling, retry with backoff (copy relist error handling at `relist.ts:76-80`).
- **Monitoring:** log relayer Base balance each run; warn when below a threshold.

## Cost
A batched `interact` of ~50 gotchis is one Base tx, a few cents. Even thousands of daily-active gotchis cost pennies per day. Effectively the "~$0 burn" the project needs.

## Build steps
1. `server/pet/abi.ts` with the verified fragments; add a tiny script (or vitest) that asserts each selector resolves via `facetAddress` on Base (expected: all SUPPORTED).
2. `server/pet/db.ts` store + `server/pet/petBot.ts` relayer (copy `relist.ts`).
3. `server/routes/pet.ts` endpoints; mount them; opt-in must verify `isPetOperatorForAll` on-chain before enabling.
4. Add the 12h loop to `server/lending/cron.ts`.
5. Client: `useGotchiKinship` + the enable/disable toggle (`setPetOperatorForAll` via wagmi) + per-gotchi kinship/cooldown UI in `GotchiActionsPanel.tsx`.
6. Tests (vitest): cooldown filter, opt-in on-chain verification, batch chunking. Optional live e2e under `tests/e2e/live`.
7. Deploy env: set `PET_RELAYER_KEY`, fund the relayer with a little ETH on Base, document in `replit.md` / deploy docs.

## STOP conditions
- `interact` / `setPetOperatorForAll` no longer resolve via `facetAddress` on Base (diamond changed) — STOP, re-verify selectors.
- Any design that pets a gotchi without a recorded opt-in AND a live `isPetOperatorForAll==true` — STOP, that violates consent and wastes gas.
- Reusing the lending `AUTORENEW_HOT_WALLET_KEY` for petting — STOP, use a dedicated key.

## Verification (definition of done)
- `npx tsc --noEmit` exit 0, `npx vitest run server/pet` green, `npx eslint . --ext ts,tsx` exit 0.
- Manual: enable auto-pet on a test wallet, confirm `isPetOperatorForAll` true, run the cron once, confirm a real `interact` tx on basescan and `lastInteracted` advances + kinship increments for a due gotchi.
