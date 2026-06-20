# Plan 004: Roadmap — grounded next-build options (soul flywheel · social · GHST sinks · companion-as-pet)

> **Nature of this file**: This is a *direction* document, not an executor task. Each item is an option for the maintainer to weigh, with the evidence it builds on and its trade-offs. The two starred (★) items are small and well-seamed enough to become their own `plans/00N-*.md` spike plans on request. Nothing here should be built without an explicit go-ahead.

## Status
- **Priority**: P3 (planning input)
- **Effort**: varies (per item)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `192d483`, 2026-06-19

## Context the options build on (verified in recon)
Implemented infrastructure these reuse: companion personality engine + SQLite store (`server/companion/`), soul depth + on-chain SoulSeal (`server/soul/`, `src/lib/soul/`), roast arena engine + leaderboard (`server/roast/`), global chat (SSE). Design intent lives in `docs/superpowers/specs/*` (companion-design, global-chat-design, dapp-parity). The maintainer's seeds: (1) soul flywheel — quests/leaderboards/perks; (2) social — diary/rivalries/auras; (3) GHST-sink monetization — arena seasons / AI lore / Baazaar provenance; (4) companion = the equipped pet (`equippedWearables[6]`).

## Options

### ★ A. Companion lore injection from soul echoes  — S effort · engagement + IP
When a gotchi has transferred, surface its already-computed, PII-scrubbed "past-life echoes" into the companion's system prompt ("you've been traded 3 times; past keepers favored the Forge"). Evidence: `server/soul/transfer.ts` already distills `pastLives`; `server/routes/companion.ts:60-61` already injects a `soulDepthSnapshot` into the prompt — this extends that assembly. Trade-off: tiny prompt-bloat risk (cap echoes). Lowest-risk, highest-charm item; purely additive.

### ★ B. Soul depth → roast bias  — S/M effort · engagement + monetization
Feed each gotchi's soul depth into the roast judge as context and weight XP slightly by depth, making Soul mechanically matter in the Arena (and a future GHST knob: deeper souls cost more to challenge / win more XP). Evidence: `server/roast/engine.ts` already fetches per-gotchi state + personality in the same flow soul depth is computed; `src/lib/roast/xp.ts` is a pure formula easy to extend; the Roast spec lists "Soul integration" as a phase-2 seam. Trade-off: couples Roast↔Soul (null-guard if Soul is down); document the bias so new gotchis don't feel cheated.

### C. Roast season + GHST prize pool  — M effort · revenue + engagement
Seasonal leaderboard tiers + season badges on winning gotchis' souls, funded by a % of battle-entry credits into an operator/escrow GHST pool. Evidence: `server/roast/store.ts` ranks by XP (schema ready for a `season` column); `roast_battles` is timestamped. Trade-off: requires operator GHST custody/escrow and a season-close cron; more product/ops surface than A/B.

### D. Companion action agent — petting/channeling  — M effort · engagement
Let the user say "go pet my gotchi" and the companion produces a signable pet/channel action, closing the companion-as-pet loop and reducing kinship friction. Evidence: companion spec explicitly labels this a phase-2 seam with no personality/UI rework; `server/routes/companion.ts` already does wallet + state orchestration to reuse. Trade-off: introduces a signing/on-chain path with failure modes (kinship window closed → revert) needing clear UX.

### E. Gotchi diary + transcript archive  — M effort · social/IP
A shareable timeline (companion memories + roast results + soul transfers + kinship milestones), exportable like the Soul Certificate. Evidence: `companion_messages`, `roast_battles.transcript`, soul `pastLives` all already persisted; `src/components/soul/SoulCertificate.tsx` already exports via `html-to-image`. Trade-off: needs event curation to avoid noise; opt-in share for privacy.

### F. Companion cosmetics — aura + pet-wearable overlay  — S effort · polish
Render a trait-tinted aura (already computed in `src/lib/companion/glow.ts`) and overlay the equipped pet wearable (`equippedWearables[6]`) on the mascot. Evidence: `CompanionMascot.tsx` renders the sprite; `GotchiSvgById.tsx` already loads wearable sprites. Trade-off: extra sprite fetch (fallback to aura-only).

## Recommended sequence
1. **A** then **B** — both small, both deepen the soul flywheel using existing seams, no new infra. Best first wins.
2. **F** — cheap visual payoff tying the pet wearable to the companion.
3. **D** / **E** — medium engagement features once A/B validate the soul-in-gameplay loop.
4. **C** — last; it carries the most ops/custody surface (real GHST handling) and benefits from seasons of roast data first.

## Turning a starred item into a spike plan
On go-ahead, write `plans/005-companion-soul-echoes.md` (for A) or `plans/006-soul-roast-bias.md` (for B) using `references/plan-template.md`: scope to the named files above, inline the current prompt-assembly excerpt, add a STOP if the soul snapshot shape differs from the excerpt, and gate on `npx vitest run server/companion` / `server/roast` plus a manual companion/roast smoke check.

## Findings considered and deferred
- Full decentralization of Soul (ERC-7857) and live PvP roast: large, spec-acknowledged phase-2/3 — out of scope for near-term plans.
