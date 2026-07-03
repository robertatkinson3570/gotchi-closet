# Steward — Base Sepolia verification runbook (A1)

The last gate before enabling hands-off automation. Everything here is **free** — no real ETH,
no paid plans. Budget ~20 minutes.

## Why this exists
The 7702 session path is what makes "runs on our VPS, but the OWNER pays gas" possible: the cron
signs userOps with a scoped session key, and gas debits the player's own EOA. The code is written
from SDK docs but has never executed on-chain. This run proves the three promises:

1. **Scope** — the session key is rejected calling anything but the allowed (target, selector).
2. **Owner-pays** — gas comes out of the player's EOA balance (not ours, not the API key's).
3. **Mechanics** — 7702 upgrade + session enable + session-signed submit work end to end.

## What you need (owner-only steps, all free)

1. **Rhinestone API key** — sign up at https://dashboard.rhinestone.dev (free tier), create an
   API key.
2. **Throwaway test wallet** — generate a fresh private key (do NOT reuse a real wallet; the key
   goes in an env var). E.g. in MetaMask create a new account and export its key.
3. **Base Sepolia ETH** — free faucets: https://portal.cdp.coinbase.com/products/faucet or
   https://www.alchemy.com/faucets/base-sepolia. ~0.05 ETH is plenty.
4. *(Optional)* **Pimlico bundler URL** for Base Sepolia (free tier at https://dashboard.pimlico.io)
   if the default Rhinestone bundler has issues: `https://api.pimlico.io/v2/84532/rpc?apikey=...`

## Run it

```bash
# PowerShell
$env:STEWARD_VERIFY_OWNER_KEY = "0x<throwaway-key>"
$env:RHINESTONE_API_KEY = "<rhinestone-key>"
# optional: $env:STEWARD_BUNDLER_URL = "https://api.pimlico.io/v2/84532/rpc?apikey=..."
npx tsx scripts/steward-sepolia-verify.ts
```

Expected: 5 checks, all ✅ — account==EOA, in-scope call executes, gas debited from the EOA,
forbidden selector rejected, wrong target rejected. The script exits 1 and says **DO NOT SHIP**
if the scope isn't enforced.

## After it passes — go-live checklist (mainnet)

1. **Server env on the VPS** (`deploy/docker-compose.yml` + VPS `.env`):
   - `RHINESTONE_API_KEY` (server-side key)
   - `STEWARD_BUNDLER_URL` (Base MAINNET bundler, e.g. Pimlico `/v2/8453/rpc`)
   - `SOUL_ENCRYPTION_KEY` (64 hex chars — the server now **refuses to boot in prod without it**)
   - confirm `STEWARD_DEV_OPEN_ENROLL` is **unset** (it's ignored in prod anyway, but keep it clean)
2. **Client env (Vercel):** `VITE_STEWARD_AUTOMATION=1`, `VITE_RHINESTONE_API_KEY`,
   `VITE_STEWARD_BUNDLER_URL` (mainnet).
   ⚠ Punch-list **B4**: the client-exposed `VITE_RHINESTONE_API_KEY` should move to Rhinestone's
   server-minted JWT mode — do it in the same PR that flips the flag, it changes the same file
   (`src/lib/steward/aaClient.ts`).
3. **Smoke on mainnet with your own wallet:** recruit a steward (pet-only), `run-now` from the
   dashboard, confirm on basescan that the tx executed and **your wallet paid the gas**, then
   Revoke and confirm the key is dead (run-now should fail / no further runs).
4. Only then announce.

## Notes / limits
- The Aavegotchi + Realm diamonds don't exist on Sepolia, so the script proves the *session
  machinery* (scope enforcement + payer), not gotchi gameplay. The gameplay calls themselves
  (`interact`/`channelAlchemica`/`claimAllAvailableAlchemica`) are already proven on Base mainnet
  (see the design doc's "Proven on-chain facts").
- Ledger cannot sign the 7702 upgrade — the wizard already tells users to use MetaMask/Rabby for
  the one-time authorize step.
- The operator (relayer) mode burns OUR gas and is therefore rejected at enroll unless
  `STEWARD_PET_RELAYER_KEY` is deliberately configured. Leave it unset.
