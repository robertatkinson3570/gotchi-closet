# Gotchi Video Engine — Design Spec

**Date:** 2026-07-03
**Status:** Approved (brainstorm 2026-07-03)
**Related:** `docs/superpowers/plans/2026-07-03-gotchicloset-growth-engine.md` (AMS app #10 — text channels; this spec covers the video half)

## 1. Purpose

Build a programmatic short-form video engine inside gotchi-closet that turns real
on-chain Aavegotchi data into vertical videos (Shorts/TikTok/Reels/Facebook format).

Three goals, sequenced:

1. **Prove-it DAO ammo** — demonstrate that the Stewardship Initiative's $30k content
   line (creative direction, visual style, animation, sound design, ~2 videos/week) is
   substantially automatable at near-zero marginal cost. The demo is working videos plus
   the repo that made them.
2. **Real weekly output** — wire into the existing AMS marketing loop so GotchiCloset
   itself ships videos on a cron.
3. **Community self-serve** — any holder generates shareable videos of their own
   gotchis, making gotchi content structurally self-service.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Goal scope | All three, sequenced | One engine, three payoffs |
| Video tech | Remotion (programmatic React) | Same stack as app; reuses existing renderers/logic; deterministic; $0/video; the "building is cheap now" argument in code form |
| Templates (v1) | PulseRecap, FitReveal, SaleAlert, Spotlight | Cover automated-weekly, personal-shareable, event-driven, and filler cadence |
| Code home | gotchi-closet repo, new `video/` workspace | Imports `src/lib` (rarity, sets, autoDressEngine) directly; the user-facing surface lives here anyway; AMS triggers via CLI |
| User-facing surface | `/pulse` page | Weekly video embeds on /pulse; self-serve generator ships as a /pulse tab first (no new top-level page until it earns one) |
| AI video gen (fal.ai etc.) | Rejected for v1 | Per-generation cost, non-deterministic, mangles pixel art, weakens the cost argument |
| Sound | Bundled CC0 track pool + small SFX set | No licensing risk on monetized platforms, no generation cost |
| Flavor text | Template bank keyed to traits | No LLM call at render time; free and deterministic |

## 3. Architecture

```
video/
  package.json          # own workspace: remotion, @remotion/cli, react
  remotion.config.ts
  theme.ts              # single source of visual style
  src/
    Root.tsx            # composition registry
    compositions/
      PulseRecap.tsx
      FitReveal.tsx
      SaleAlert.tsx
      Spotlight.tsx
    components/         # shared: GotchiSprite, StatCounter, TraitBar, EndCard...
    audio/              # track pool + SFX (CC0), pickTrack(videoId) seeded hash
  prep/
    pulseRecap.ts       # fetch -> props/<video-id>.json
    fitReveal.ts
    saleAlert.ts
    spotlight.ts
    assets.ts           # gotchi/wearable SVG fetch + cache
  props/                # generated props JSONs (gitignored except fixtures)
  fixtures/             # checked-in props for tests/golden frames
  assets/cache/         # downloaded SVGs (gitignored)
```

**Format:** 1080×1920 vertical, 30fps, 20–45s depending on template (SaleAlert ~15s).

### Determinism boundary

All network I/O happens in `prep/` scripts only:

- Subgraph data via `coreSubgraphFetch` (never raw fetch — per repo rule).
- Pulse stats via the existing pulse API/lib.
- Gotchi + wearable SVGs fetched once and cached to `assets/cache/`.

Each prep script emits a self-contained `props/<video-id>.json` (data + local asset
paths). Compositions are pure functions of props: **no network at render time; same
JSON in, same MP4 out.** This is also what makes the browser self-serve tab cheap —
`@remotion/player` consumes the identical props shape.

### Shared code reuse

Compositions import pure TS modules from `src/lib` (rarity, sets, autoDressEngine,
format). These have no Vite/browser dependency, so they work under Remotion's bundler.
Anything that turns out to be Vite-coupled gets its logic extracted, not duplicated.

## 4. Templates

| Template | Content | Trigger |
|---|---|---|
| **PulseRecap** | Weekly stats from /pulse data: sales count/volume, biggest flip, petting streaks, top rentals; animated counters, gotchi cameos of the week's stars | Weekly cron |
| **FitReveal** | Naked gotchi → wearables equip slot-by-slot → BRS counter rolls up → set-bonus stinger. Parameterized by gotchi ID (+ optional target build) | On demand; later self-serve |
| **SaleAlert** | One notable Baazaar sale: gotchi art, price, traits, ENS names, rarity flair | Sale over threshold |
| **Spotlight** | Name, age, kinship, traits, equipped set, owner + trait-keyed flavor-text line | On demand / filler cadence |

## 5. Visual style & sound

- `video/theme.ts` holds the entire look: app palette colors, pixel font,
  gotchi-pink/purple gradients, scanline/CRT flourish. All templates read from it —
  one file *is* the "new visual style" line item.
- Audio: per-template mood mapping into a CC0 chiptune pool; SFX set (equip blip,
  counter tick, sale cha-ching). Track choice = seeded hash of video ID (stable per
  video, varied across videos).

## 6. Surface on /pulse

- **Weekly video embed:** the latest PulseRecap MP4 is published to the site and
  embedded at the top of `/pulse` with a share/download affordance — the page that
  sources the data also showcases its weekly artifact.
- **Self-serve tab (Phase 3):** a "Studio" tab on `/pulse`: connect wallet → pick
  gotchi → live preview via `@remotion/player` → request MP4 render (rate-limited
  server queue). FitReveal + Spotlight first. Promote to its own page only if usage
  justifies it.

## 7. Rollout phases

- **Phase 1 — the demo (DAO ammo):** engine + all four templates render locally via
  `remotion render`; produce several real videos from live data; post manually. The
  forum receipt is the videos + this repo.
- **Phase 2 — weekly loop:** VPS cron renders PulseRecap weekly and SaleAlert on
  threshold sales; MP4s drop into the AMS Telegram approval queue (growth-engine plan
  §3 autonomy table applies); approved weekly video also publishes to `/pulse`.
  Manual upload to platforms until/unless platform APIs are wired.
- **Phase 3 — self-serve Studio tab** on `/pulse` (see §6).

## 8. Error handling

- Prep scripts fail loudly and produce no props file on bad/missing data (no
  half-rendered videos from partial data).
- Asset cache misses re-fetch once, then fail the prep run — render never starts
  with placeholder art.
- Phase 2 cron: a failed render skips the week's queue push and logs; it must not
  block other AMS queue traffic. /pulse keeps showing the previous week's video.
- Phase 3 queue: per-wallet rate limit; render errors surface to the user as a
  retryable message, not a stuck job.

## 9. Testing

- **Golden-frame snapshots:** render specific frame numbers per template from fixture
  props; pixel-compare against checked-in PNGs.
- **Prep unit tests:** data-shaping logic tested against recorded subgraph/pulse
  responses; no live network in CI.
- **Fixture props JSONs** checked into `video/fixtures/` so tests and golden frames
  never touch the network.

## 10. Out of scope (v1)

- AI-generated video or audio.
- Auto-posting to platform APIs (YouTube/TikTok/Meta) — manual or Telegram-approved
  manual posting first; API posting is a later AMS concern.
- Land/parcel or Gotchiverse 3D content — 2D gotchi/wearable art only.
- LLM-written scripts or captions at render time.
