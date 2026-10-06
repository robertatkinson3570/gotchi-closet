# Gotchi Closet as an AuditKit customer

Branch `auditkit-sdk` (based on `agent/keeper-wisp`). Security-relevant server
actions are now written to AuditKit, the hash-chained, publicly anchored audit
log, one AuditKit tenant per wallet.

## Publish prerequisite (blocks merge)

`package.json` adds `"@auditkit/sdk": "^2.0.0-alpha.0"`. That version must be
published to npm before this merges; `pnpm install` fails until it is. After
publishing, run `pnpm install` once to add it to `pnpm-lock.yaml` (the lockfile
is deliberately untouched here). The local compile check used a temporary
`link:` to `~/Projects/auditkit-v2/packages/sdk`, reverted before commit.

## How to enable

Set `AUDITKIT_API_KEY` in the VPS `.env` (and optionally `AUDITKIT_BASE_URL`,
default `https://api.auditkit.dev`); both are in `.env.example`. With no key
the module is a no-op; nothing else changes. No deploy config was touched.

## What is logged

One module, `server/audit/auditkit.ts`, exporting
`audit(tenantWallet, actor, action, target?, payload?)` on `@auditkit/sdk`.
Tenant is the wallet (lowercase); a Wisp key minted with no wallet falls into
the shared tenant `no-wallet`.

| action | where | target | payload |
| --- | --- | --- | --- |
| `steward.enroll` | `steward/db.ts enroll` | enrollment id | gotchiId, chores, intervalSec, authMode, smartAccount |
| `steward.pause` / `steward.resume` / `steward.revoke` | `steward/db.ts setStatus` | enrollment id | gotchiId, from, to |
| `steward.chores.edit` | `steward/db.ts editChores` | enrollment id | gotchiId, chores |
| `steward.run` | `steward/cron.ts runOne` (cron tick and owner "run now") | enrollment id | gotchiId, authMode, forced, ran, reason, txHash, pet/channel/claim counts |
| `steward.run.fail` | same, on a thrown run | enrollment id | gotchiId, authMode, forced, error (first 180 chars) |
| `companion.premium.grant` | `companion/db.ts grantPremium` | txHash | expiresAt, txHash |
| `companion.credits.grant` | `companion/db.ts addCredits` (the `/premium/claim` path) | txHash | credits, total, txHash |
| `wisp.key.mint` | `mcp/accounts.ts createAccount` | key fingerprint | plan |
| `wisp.key.rotate` | `mcp/accounts.ts rotateKey` | new key fingerprint | revokedKey (fingerprint) |
| `wisp.plan.activate` | `mcp/accounts.ts activatePlan` (the `/api/mcp/buy` path) | key fingerprint | plan, months, asset, amountWei, txHash, expiresAt |
| `wisp.context.set` | `mcp/accounts.ts setContext` | key fingerprint | appName, appUrl |

Actor is the wallet for owner-signed actions, `steward-cron` for the cron, and
`wisp-app` for a keyed app call with no wallet on the account. A steward tick
that is only "not-due" (interval gate, nothing touched) is not logged.

Entitlement changes from payments are covered at the ledger (`activatePlan`,
`addCredits`, `grantPremium`); there is no payments webhook under
`server/payments` (those files only verify transactions), so nothing was added
there.

## What is not logged

- No emails, API keys, session keys, signatures, encryption keys or request
  bodies. A Wisp key appears only as `keyFingerprint` = first 16 hex of
  sha256(key).
- Reads (status, log, upkeep preview, chat, MCP tool calls) and rate-limit
  counters.
- `steward.run` outcomes of `not-due`.

## Behaviour

- Every call is fire-and-forget: never awaited on the request path, never
  throws into app logic (a synchronous SDK failure is caught too).
- Delivery errors are logged to `console.error` at most once per minute.
- The SDK sends an idempotency key per event and retries 429/5xx/network up
  to 3 times, so a lost response never double-logs.

## Tests

- `server/audit/auditkit.test.ts`: no-op without a key; SDK wire shape with a
  fake fetch (URL, bearer, idempotency key, tenant/actor/action/target/payload,
  undefined fields dropped); system actor kept; never throws; error throttle;
  key fingerprint.
- `vitest run server/audit server/steward server/companion server/mcp`: 26
  files, 179 tests pass. `pnpm typecheck` passes.
