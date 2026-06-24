# Steward — design + build spec

> **For the executor:** This is a self-contained spec. Build it in an isolated worktree. Every on-chain
> fact below was verified live against Base mainnet on 2026-06-23 (see "Proven on-chain facts"); re-run the
> drift check before coding. If anything in "STOP conditions" occurs, stop and report.

## One paragraph

**Steward** lets a player put a soul-bearing gotchi "to work" maintaining their whole Aavegotchi estate,
hands-off. A steward automatically **pets all their gotchis, channels all their parcels, and empties all
their reservoirs** on a schedule. The player keeps full custody (assets never move), pays 100% of gas from
their own funds, and the operator (us) pays nothing. The thing that makes it ours and not a generic bot:
the steward is a soul-bearing gotchi, its work deepens the same soul/XP shown in the companion chat, so it
reads as a character with a job, not a cron script.

## What it is (scope in one list)

- A new **Steward** page in gotchi-closet (the web app), plus the backend that runs the automation.
- Exactly **three chores**: pet, channel, empty reservoirs. Nothing that spends or trades (no swap, no buy,
  no claim-escrow, no rentals; those are explicitly out of scope here).
- **Gated by a soul cert**: only a gotchi that has a minted soul can be made a steward.
- Runs on **our VPS** (alongside the existing lending cron), never on Vercel.

## Why now (the Base agentic-economy context)

This feature is timed to a specific shift: Base is actively shipping the rails for **on-chain agents**, and
Steward is gotchi-closet's native play into that wave. The trigger was jesse.base.eth (Jesse Pollak):

> "your agent can now trade, lend, mint, launch, yield, buy, and and and across 13 more apps on @base"
> — https://x.com/jessepollak/status/2069559215673495992

What sits under that tweet (researched 2026-06-23):

- **Base MCP / agent SDK.** Base shipped Model Context Protocol integrations so agents can call on-chain apps
  as tools. The original `base/base-mcp` repo was archived May 2026 and folded into the core Base agent
  SDK/docs (`docs.base.org/ai-agents`). Agent-callable on-chain actions are now a first-class Base surface.
- **x402 micropayments.** Base's HTTP-402 pay-per-call standard in USDC: ~69k active agents, 165M+ transactions,
  ~$50M volume by April 2026; now wired into Amazon Bedrock AgentCore and an agent app store (agent.market).
- **Account abstraction / spend permissions.** Smart accounts + session keys + EIP-7702 on Base are exactly
  the primitives that make a scoped, player-funded, non-custodial agent possible — i.e. the Steward custody
  model in "Architecture" below is built on the stack Base is pushing.

**Why Steward fits.** A soul-bearing gotchi acting as an estate agent (pet/channel/claim on the player's
behalf, player-funded, revocable) is a native Base-2026 product, not a bolt-on. Building the steward actions as
MCP tools (the dogfood reuse below) lets the same logic serve both the in-app UI and any external Base agent,
so gotchi-closet rides the agentic-economy distribution instead of fighting it.

Sources: the jessepollak tweet above; `blog.base.org/the-agentic-economy-is-here`; Coinbase x402 + Bedrock
AgentCore announcements; Fortune, "Coinbase pushes further into AI payments with new MCP for Base network"
(2026-05-26).

## Proven on-chain facts (Base 8453, verified 2026-06-23)

Diamonds:
- Aavegotchi diamond: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`
- Realm (Gotchiverse) diamond: `0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372`

All selectors resolve via DiamondLoupe `facetAddress` (present on the live diamonds):

| Function | Diamond | Purpose |
|---|---|---|
| `interact(uint256[])` | Aavegotchi | pet (raise kinship) |
| `setPetOperatorForAll(address,bool)` | Aavegotchi | approve a pet operator (operator can ONLY `interact`) |
| `isPetOperatorForAll(address,address)` | Aavegotchi | verify operator approval |
| `channelAlchemica(uint256,uint256,uint256,bytes)` | Realm | channel a parcel altar with a gotchi |
| `claimAvailableAlchemica(uint256,uint256,bytes)` | Realm | empty one parcel's reservoirs to the owner |
| `claimAllAvailableAlchemica(uint256[],uint256,bytes)` | Realm | empty many parcels' reservoirs to the owner |
| `getParcelsAccessRights(uint256[],uint256[])` | Realm | read access mode (action 0=channel, 1=reservoir) |
| `getLastChanneled(uint256)` / `getParcelLastChanneled(uint256)` | Realm | cooldown reads |

**Signature gate is gone on this build.** `channelAlchemica` and the claim functions accept an empty `"0x"`
signature (the old Pixelcraft `LibSignature` backend check was removed on the Base/geist build). Proven: the
owner path executes with `"0x"` and returns NO REVERT.

**Access control is owner-only by default, and it gates channel + claim.** Verified by simulation:
- `claimAvailableAlchemica` as the parcel owner -> NO REVERT, executes (parcel 10036, real claimable balance
  10 FUD / 5 FOMO / 3 ALPHA / 0.4 KEK, gotchi 207).
- Same call as a non-owner relayer -> revert `LibRealm: Access Right - Only Owner`.
- `channelAlchemica` as non-owner -> `Only Owner`; as owner -> passes the access gate (downstream reverts were
  ordinary gameplay state: `Not Altar`, `Gotchi CANNOT have active listing for lending`, both filtered at run).
- Survey of 120 live parcels: 100% are access mode 0 (owner-only) for both channeling and reservoirs.

**Petting is permissionless-ish.** `interact([id])` from a random non-owner returned NO REVERT. Treat as: the
operator path (`setPetOperatorForAll`) is the guaranteed-correct route; before relying on permissionless
petting, confirm a non-owner `interact` actually advances kinship (state diff) rather than no-ops.

### Consequence for the architecture
Because channel + claim require the transaction sender to be the parcel owner, the automation must execute as
the player's own account. We do NOT open parcel access rights to a third party (nobody does; it is a security
downgrade). Instead we make the player's own account drivable by a scoped key, see below.

## Architecture

**Custody model: non-custodial, player-funded gas.**

1. **Onboarding (one-time, in the wizard):** the player's existing EOA, which already owns the gotchis +
   parcels, is upgraded to a smart account via **EIP-7702** (assets never move). They grant a **session key**
   scoped to exactly three functions: `interact`, `channelAlchemica`, `claimAllAvailableAlchemica`, and fund a
   small **gas float** (a couple dollars of ETH) or attach a paymaster.
2. **Run loop (our VPS, gasless for us):** a cron loop wakes on each steward's schedule, computes what is due
   (subgraph + on-chain cooldown reads), and submits **userOps signed by the session key**. The userOp executes
   as the player's own owner account, so it passes `Only Owner`. The **player's float pays gas.** We submit; we
   never pay gas; the session key can do nothing but the 3 scoped calls.
3. **Revoke anytime:** killing the session key (or the 7702 delegation) instantly stops the steward. The key
   cannot transfer, sell, list, or spend, only pet/channel/claim, and claim pays the owner.

**Open decision (resolve in the plan):** the concrete AA stack. Candidates on Base: Coinbase Smart Wallet +
spend/session permissions; or a 4337 bundler + paymaster (Pimlico / ZeroDev / Alchemy). Base supports 7702.
This is the one genuinely new piece of infra; everything else is reuse.

## Gas: cheapest feasible (Base L2)

Levers, in order of impact:

1. **Batch per run.** One run = at most one `interact([all due gotchis])` + one
   `claimAllAvailableAlchemica([all ready parcels], gotchi, "0x")` + the channel calls. Pet and claim collapse
   from N txs to 1 each. With a 7702 batch-executor, bundle them into a **single userOp** so validation +
   paymaster overhead is paid once, not per action.
2. **EIP-7702, not a freshly deployed 4337 wallet.** No account-deployment cost; the existing EOA is the sender.
3. **Never submit a no-op.** Gate every action on real work: skip reservoirs under `CLAIM_DUST_MIN`, parcels
   with no altar, gotchis within cooldown. A tx that does nothing still costs gas.
4. **Fire at the cooldown floor, no more often** (8h/12h). Let the player widen the interval to cut runs
   further ("less frequent = cheaper"). Since alchemica yield is near-zero today, longer intervals are often
   net-positive for the player.
5. **Calldata is the real L2 cost.** Batching shrinks per-action calldata overhead; pass `"0x"` sigs; tight arrays.
6. **Lightest paymaster path.** Prefer a prepaid **ETH** float with the simplest paymaster; an ERC-20 (USDC/GHST)
   paymaster adds oracle/swap overhead, use only if the player will not hold ETH.

Honest note: AA/userOp execution always costs somewhat more than a raw EOA transaction (validation overhead),
but on Base a fully-batched run is still a fraction of a cent. The dominant savings are batching + skipping
no-ops + interval, not micro-optimizing the AA stack.

## The steward model & rules

- A steward operates across the **whole estate**: its chores apply to all the owner's gotchis / parcels /
  reservoirs, not just the steward gotchi itself.
- **Chores are exclusive.** Each of {pet, channel, claim} may be assigned to at most one active steward per
  owner (a chore already covers every asset, so a second steward doing the same chore is redundant).
- A steward may hold **1, 2, or all 3** chores. The player can add a second/third steward only while a chore is
  still unclaimed (e.g. Aimee = pet, Zeke = channel+claim). **Once one steward holds all 3 chores the estate is
  fully covered -> no other gotchi can be put on duty.**
- **Cadence:** the parcel chores (channel + reservoir) fire on a **configurable interval**, floor **8h** (the
  on-chain cooldown), default 8h, selectable up (12h, 24h, ...). Petting rides its own **12h** cooldown.
- **Soul gate:** a gotchi must have a minted soul cert to be enrolled.

## The page (UX), "super sexy beast mode"

One gotchi-centric page that routes each gotchi to the right place. This is a flagship surface; build it to
feel like a **premium command center**, not a settings form.

**Visual direction (beast mode):**
- Dark, high-contrast "mission control" aesthetic. Alchemica-tinted accents (FUD purple / FOMO red / ALPHA blue
  / KEK green) used as data color, not decoration.
- The on-duty steward is the hero: large rendered gotchi, subtle idle animation, an animated "On Duty"
  glow/pulse, a live soul-XP bar that fills with motion.
- Juicy micro-interactions: cards lift/tilt on hover, the badge shimmers, numbers count up, a "Steward's log"
  feed that streams in like a terminal. Tasteful motion (framer-motion or equivalent), not noise.
- Mobile-first responsive; the grid reflows to a single column; the dashboard stays glanceable.

**State machine (per gotchi card -> destination):**

```
On Duty (enrolled)   -> MANAGE view (dashboard / report)
Has soul, idle       -> WIZARD (recruit)
No soul              -> SOUL MINT (obtain cert, then becomes idle-with-soul)
```

Page header carries an estate summary strip: N on duty - last run - alchemica this week - gas float.

**Wizard (recruit), 4 steps:**
1. **Meet your steward** — the gotchi + its soul/personality blurb (pulled from the companion engine).
2. **Pick the chores** — Pet / Channel / Empty reservoirs; only chores not already claimed by another active
   steward are selectable. Choose the parcel interval (>= 8h).
3. **Authorize (1 tap)** — plain language: "Hiring {name} to pet / channel / claim. It can ONLY do these.
   Revoke anytime." -> EIP-7702 + scoped session key.
4. **Fund gas float** — deposit a small ETH float (or attach paymaster) -> "{name} is On Duty".

**Manage view (dashboard / report):** hero gotchi + "On Duty since {date}"; **soul XP/depth = the exact same
stats object as the companion chat** (one source of truth, not a second number); "This week" totals; a
**Steward's log** feed (each automated action with tx link); chore toggles + next-run/cooldown; gas float
status with top-up; controls: **Pause / Edit chores / Revoke**.

## Reuse targets (do not reinvent)

| Need | Reuse |
|---|---|
| Relayer wallet + write pattern | `server/lending/relist.ts` (`initWallet` ~L18-26; `writeContract` shape ~L65-73), adapt to userOp submission |
| Scheduled loop | `server/lending/cron.ts`, add a steward loop beside the lending one |
| SQLite store pattern | `server/companion/db.ts` (better-sqlite3, prepared statements) |
| Addresses + ABIs + cooldowns | `src/lib/lending/contracts.ts` (`AAVEGOTCHI_DIAMOND_BASE`, `REALM_DIAMOND_BASE`, `REALM_FACET_ABI`, `CHANNEL_COOLDOWN_SEC`, `RESERVOIR_COOLDOWN_SEC`, `CHANNEL_COOLDOWN_SEC_BY_ALTAR`, `CLAIM_DUST_MIN`) |
| Channel/claim shapes + cooldown logic | `src/hooks/useRealmActions.ts`, `src/hooks/useLandAlchemica.ts` (claimable gating, `channelAll` rotation, batch sizing) |
| Pet selectors/ABI | `plans/006-gasless-petting.md` (`PET_FACET_ABI`, verified) |
| Soul XP / depth stats | the companion soul stats used by the chat (dashboard shows the identical object) |
| Agent-tool surface (dogfood) | `server/mcp/*`, expose steward actions as MCP tools; web app is customer #1 (same as Wisp plan 003) |
| Gas-float / cert payment verify | `server/payments/*` (ETH/USDC on Base) |

## Backend components

- `server/steward/abi.ts` — pet/channel/claim fragments (reuse from contracts.ts).
- `server/steward/db.ts` — better-sqlite3 store. Suggested tables (synthetic values shown):
  ```
  steward_enrollments(
    id INTEGER PK, owner_address TEXT, steward_gotchi_id INTEGER,
    chores TEXT,                 -- e.g. {"pet":true,"channel":true,"claim":false}
    parcel_interval_sec INTEGER, -- e.g. 28800  (8h floor)
    smart_account TEXT, session_key TEXT,
    status TEXT,                 -- active | paused | revoked
    created_at INTEGER, last_run_at INTEGER
  )
  -- enforce: each chore assigned to at most one ACTIVE enrollment per owner_address
  steward_log(id INTEGER PK, owner_address TEXT, steward_gotchi_id INTEGER,
    action TEXT, detail TEXT, tx_hash TEXT, ts INTEGER)
  ```
- `server/steward/runner.ts` — `dueWork(enrollment)` (which gotchis need petting / which parcels are
  off-cooldown to channel / which reservoirs are claimable) and `runEnrollment(enrollment)` that submits the
  batched userOps via the session key. Reuse cooldown + claimable gating from `useLandAlchemica`.
- `server/steward/aa.ts` — session-key signing + userOp submission against the chosen AA stack.
- `server/routes/steward.ts` — `POST /api/steward/enroll`, `/pause`, `/resume`, `/revoke`, `/edit-chores`,
  `GET /api/steward/status`, `GET /api/steward/log`. Enroll must verify session-key authorization on-chain first.
- `server/lending/cron.ts` — add the steward loop (guarded behind the relayer/AA config presence).

## Frontend components

- `src/pages/StewardPage.tsx` — the grid + summary strip + per-card state routing.
- `src/components/steward/StewardCard.tsx` — the three card states + badge + soul-XP bar + motion.
- `src/components/steward/RecruitWizard.tsx` — the 4-step flow (chore picker disables claimed chores; interval
  selector; 7702 + session-key auth; gas-float funding).
- `src/components/steward/ManageView.tsx` — dashboard/report + soul XP (same stats object as chat) + log feed +
  controls.
- `src/hooks/useSteward.ts` — read enrollment status / log; trigger enroll/pause/revoke.

## Out of scope (do NOT build here)
Swapping alchemica -> GHST, buying gotchis/wearables, claim-escrow, rentals, paymaster-sponsored-by-us gas, any
value-moving action. Multi-steward beyond the 3-chore exclusivity rule. Soul-mint flow itself (it exists;
Steward only links to it as the gate).

## Build steps
1. `server/steward/abi.ts` + a tiny `facetAddress` assertion test (all selectors SUPPORTED on Base).
2. Choose + wire the AA stack (`server/steward/aa.ts`): 7702 delegation, session key scoped to the 3 selectors,
   player-funded gas. Prove a single session-key `interact` on a test wallet.
3. `server/steward/db.ts` (+ chore-exclusivity constraint) and `server/steward/runner.ts` (batched, no-op skipping).
4. `server/routes/steward.ts`; mount it; enroll verifies session-key authorization on-chain first.
5. Add the steward loop to `server/lending/cron.ts`.
6. Frontend: `StewardPage` -> `StewardCard` (3 states) -> `RecruitWizard` (4 steps) -> `ManageView`
   (dashboard + soul XP + log). Beast-mode visual pass.
7. Tests (vitest): chore-exclusivity, due-work cooldown gating, batch chunking, no-op skipping, enroll auth check.
   Optional live e2e under `tests/e2e/live`.
8. Deploy env on the VPS: AA/paymaster keys, document in `replit.md` / deploy docs.

## STOP conditions
- Any selector stops resolving via `facetAddress` on Base (diamond changed) — STOP, re-verify.
- Any design where the session key can do anything beyond the 3 scoped functions — STOP (custody violation).
- Any path where the operator (us) pays user gas — STOP (must be player-funded).
- Petting relied on as permissionless without confirming kinship advances for a non-owner — STOP, use the
  `setPetOperatorForAll` operator route.

## Verification (definition of done)
- `npx tsc --noEmit` exit 0, `npx vitest run server/steward` green, `npx eslint . --ext ts,tsx` exit 0.
- Manual: enroll a test wallet (7702 + session key + gas float), run the cron once, confirm real `interact` /
  `channelAlchemica` / `claimAllAvailableAlchemica` txs on basescan, kinship/`lastChanneled`/reservoir state
  advances, and **gas was paid from the player's float, not ours**.
- A full run is **a single batched userOp** where possible (gas check); no-op work is never submitted.
- Chore exclusivity holds (cannot enroll a second steward for an already-claimed chore; all-3 blocks new enrollments).
- Dashboard soul XP matches the companion chat value for the same gotchi.

## Open decisions (resolve in the plan)
1. AA stack choice (Coinbase Smart Wallet permissions vs 4337 bundler+paymaster), pick the cheapest per-run.
2. Gas float currency: prefer prepaid **ETH** for lowest overhead; ERC-20 paymaster only if needed.
3. Petting via permissionless `interact` or the `setPetOperatorForAll` operator (pending kinship state-diff check).
4. Soul-as-memory: does the Steward's log feed back into soul depth now, or phase 2?
