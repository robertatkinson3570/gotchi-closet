# Steward Phase 1 — hands-off automation (handoff)

Branch: **`feat/steward-aa`** (off `main`; `main` carries the live Path 2). Phase 1 makes the
steward run **zero-click**: it pets / channels / claims on a schedule via an EIP-7702 + ERC-7579
scoped session key, **the player pays their own gas, and the operator pays $0 in vendor fees.**

## Status (as of this handoff)
- ✅ **Code complete** — integration on the free stack, paid `@rhinestone/sdk` removed.
  typecheck 0 · lint 0 · 42 steward unit tests pass.
- ✅ **Preflight green on both chains** (`node scripts/preflight-aa.mjs`) — every module deployed
  on Base Sepolia AND Base mainnet; encoders compute; viem `signAuthorization` present; Alto boots.
- ⏳ **Funded testnet proof pending** — needs the two `.env.testnet` wallets faucet-funded, then
  `scripts/verify-aa-sepolia.mjs`. This is the "it works on-chain" milestone.
- ⏳ **Mainnet go-live** — after the proof (steps below).

## Architecture (the free, self-hostable stack)
- **Account:** the owner's EOA, EIP-7702-delegated to the **Safe 1.4.1 singleton** with the
  **Safe7579** adapter (so it's an ERC-7579 modular account). Same address; assets never move.
- **Session:** an **ERC-7579 smart-sessions** validator key, scoped to ONLY the chosen chores'
  `(target, selector)` pairs (`src/lib/steward/sessionSpec.ts`). It can never transfer/sell/spend.
- **Libs:** `@rhinestone/module-sdk@0.4.0` (encoding only — pinned; deprecated as a package but the
  on-chain modules it targets are permanent/immutable, so it keeps working) + `permissionless@0.2.57`
  + `viem@2.44`. **No paid SDK, no vendor account, no API key.**
- **Bundler:** self-hosted **Alto** (`deploy/bundler/docker-compose.yml`), EntryPoint v0.7. It only
  relays userOps; **no paymaster** — the player's 7702 account pays its own gas. The bundler's
  executor wallet is reimbursed in-protocol (keep a small ETH float in it).
- **Verified addresses** (both chains, from `preflight-aa.mjs`): EntryPoint v0.7
  `0x0000000071727De22E5E9d8BAf0edAc6f37da032` · Safe singleton `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`
  · Safe7579 `0x7579EE8307284F293B1927136486880611F20002` · launchpad `0x7579011aB74c46090561ea277Ba79D510c6C00ff`
  · OwnableValidator `0x2483DA3A338895199E5e538530213157e931Bf06` · SmartSessions `0x00000000008bDABA73cD9815d79069c247Eb4bDA`
  · Rhinestone attester `0x000000333034E9f539ce08819E12c1b8Cb29084d`. (Mock attester is testnet-only, unused in prod.)

## Flow
1. **Enroll (client, `aaClient.issueSessionKey`):** ONE owner-signed, **owner-paid** setup tx —
   `signAuthorization`(→ Safe singleton) + `setup`/`addSafe7579` installing the ownable +
   smart-sessions validators with the scoped session **pre-enabled**. Returns a `SessionBlob`
   `{ accountAddress, sessionPrivateKey, permissionId, chores, chainId }` (stored encrypted).
2. **Run (server, `aa.ts` submit):** the cron rebuilds the Safe7579 account from its address +
   the session key, and sends ONE batched userOp (USE mode) through `STEWARD_BUNDLER_URL`. The
   player's EOA pays gas. `Submitter` interface unchanged, so `runner`/`cron` are untouched.

## File map (branch changes)
- `src/lib/steward/sessionSpec.ts` — actions in module-sdk shape (`getSudoPolicy`).
- `src/lib/steward/aaClient.ts` — `issueSessionKey` (7702 Safe7579 setup + session) — **client**.
- `server/steward/aa.ts` — `makeSubmitter().submit` (permissionless + self-hosted bundler) — **server**.
- `deploy/bundler/docker-compose.yml` — self-hosted Alto (testnet + mainnet).
- `scripts/verify-aa-sepolia.mjs` — the funded testnet proof harness.
- `scripts/preflight-aa.mjs` — read-only module/encoder preflight (both chains).
- `.env.testnet` (gitignored) — throwaway testnet keys. `package.json` — `@rhinestone/sdk` removed,
  `@rhinestone/module-sdk` added.

## Run the testnet proof (the milestone)
1. Faucet the two `.env.testnet` addresses with Base Sepolia ETH (~0.02 each):
   EXECUTOR `0x8551e2919146eC24f20267bff3d92A9c3743Bd6d`, OWNER `0x1216f072e243025bf7623A360e64423A56779D8a`.
2. Start the bundler:
   `BUNDLER_EXECUTOR_KEY=<TESTNET_EXECUTOR_KEY> BUNDLER_RPC_URL=https://sepolia.base.org docker compose -p steward-bundler -f deploy/bundler/docker-compose.yml up -d`
3. Run the proof: `BUNDLER_URL=http://localhost:4337 node scripts/verify-aa-sepolia.mjs`
   → prints the setup-tx hash + the userOp tx hash on Base Sepolia. Green = Phase 1 works.

## Mainnet go-live (after the proof)
1. **Bundler on the VPS:** run `deploy/bundler/docker-compose.yml` with `BUNDLER_RPC_URL=https://mainnet.base.org`
   and a funded **mainnet** executor key (GH secret + a small reimbursed ETH float). Isolated from
   the app stack so it can't take the site down.
2. **Server env** (VPS `.env` via the deploy workflow): `STEWARD_BUNDLER_URL=http://localhost:4337`,
   `STEWARD_RPC_URL=https://mainnet.base.org`. The steward cron then submits real userOps.
3. **Client env** (Vercel): `VITE_STEWARD_AUTOMATION=1` to re-enable the recruit wizard (currently
   gated off on `main`), `VITE_BASE_RPC_URL` set.
4. **One pet-only mainnet dry-run** on a real wallet to confirm a live pet, then open it up.

## Costs
- **Operator: ~$0** — no vendor SDK fee, no paymaster. Only the VPS (already owned) + a small,
  reimbursed ETH float in the bundler executor.
- **Player:** pays their own gas (the setup tx once + each run's userOp). Pennies on Base.

## Known caveats / risks
- **End-user wallet must support EIP-7702** (sign the setup tx with `authorizationList`) — recent
  MetaMask/Rabby do; **Ledger/cold wallets generally don't yet**. Those users use Path 2 (one-click).
- `module-sdk@0.4.0` is **deprecated as a package** but pinned; the on-chain modules are permanent so
  it keeps working. Revisit only if a future module version is needed.
- The setup tx is **owner-paid** (one-time, the deliberate "operator pays nothing" choice).
- Re-run `preflight-aa.mjs` before the mainnet flip as a sanity gate.
