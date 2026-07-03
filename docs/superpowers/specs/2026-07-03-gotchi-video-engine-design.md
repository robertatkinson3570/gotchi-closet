# Gotchi Video Engine + Megaphone — Design Spec

**Date:** 2026-07-03
**Status:** Approved (brainstorm 2026-07-03; revised same day: /megaphone automarketer)
**Related:** `docs/superpowers/plans/2026-07-03-gotchicloset-growth-engine.md` (AMS app #10 — text channels; this spec covers video + the in-app content-ops surface)

## 1. Purpose

Two connected pieces:

1. **Video engine** — programmatic short-form video generation inside gotchi-closet:
   real on-chain Aavegotchi data → vertical videos (Shorts/TikTok/Reels/Facebook format).
2. **Megaphone (`/megaphone`)** — a community automarketer page: generated content lands
   there, contributors adjust and add, an approval gate keeps quality, and approved
   content distributes to Twitter/X, Discord, and YouTube — from official accounts
   automatically, and from anyone's own account via grab-and-post packs.

Three goals, sequenced:

1. **Prove-it DAO ammo** — demonstrate that the Stewardship Initiative's $30k content
   line (creative direction, visual style, animation, sound design, ~2 videos/week) is
   substantially automatable at near-zero marginal cost — and that the community-ops
   piece can be structurally self-service.
2. **Real weekly output** — videos ship on a cron for GotchiCloset itself.
3. **Community self-serve** — holders generate videos of their own gotchis and
   amplify approved content from their own handles: the community IS the marketing team.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Goal scope | All three, sequenced | One engine, three payoffs |
| Video tech | Remotion (programmatic React) | Same stack as app; reuses existing renderers/logic; deterministic; $0/video; the "building is cheap now" argument in code form |
| Templates (v1) | PulseRecap, FitReveal, SaleAlert, Spotlight | Cover automated-weekly, personal-shareable, event-driven, and filler cadence |
| Code home | gotchi-closet repo, new `video/` workspace | Imports `src/lib` (rarity, sets, autoDressEngine) directly; the user-facing surface lives here anyway; AMS triggers via CLI |
| Content-ops surface | **`/megaphone` page** (admin + contributors) | Outgrew a /pulse tab once contributors + posting queue + pack library entered scope. /pulse keeps only the public weekly-video embed |
| Distribution model | **Hybrid** | Approved content auto-posts from official accounts on schedule (guaranteed cadence) AND is grabbable as packs for anyone to post from their own handle (decentralized amplification, zero credential sharing) |
| Review flow | In-app (Megaphone), Telegram notify-only | Telegram compresses video and can't judge frame quality; review where the full-res MP4 lives. Replaces the growth-engine plan's Telegram-approval step for video |
| Contributor gating | Game Center pattern (wallet auth, submit → admin approve) | Machinery already exists and is proven |
| AI video gen (fal.ai etc.) | Rejected for v1 | Per-generation cost, non-deterministic, mangles pixel art, weakens the cost argument |
| Sound | Bundled CC0 track pool + small SFX set | No licensing risk on monetized platforms, no generation cost |
| Flavor text | Template bank keyed to traits | No LLM call at render time; free and deterministic |

## 3. Video engine architecture

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
JSON in, same MP4 out.** The browser preview (`@remotion/player` in Megaphone)
consumes the identical props shape.

### Shared code reuse

Compositions import pure TS modules from `src/lib` (rarity, sets, autoDressEngine,
format). These have no Vite/browser dependency, so they work under Remotion's bundler.
Anything that turns out to be Vite-coupled gets its logic extracted, not duplicated.

## 4. Templates

| Template | Content | Trigger |
|---|---|---|
| **PulseRecap** | Weekly stats from /pulse data: sales count/volume, biggest flip, petting streaks, top rentals; animated counters, gotchi cameos of the week's stars | Weekly cron |
| **FitReveal** | Naked gotchi → wearables equip slot-by-slot → BRS counter rolls up → set-bonus stinger. Parameterized by gotchi ID (+ optional target build) | On demand; contributor-requestable |
| **SaleAlert** | One notable Baazaar sale: gotchi art, price, traits, ENS names, rarity flair | Sale over threshold |
| **Spotlight** | Name, age, kinship, traits, equipped set, owner + trait-keyed flavor-text line | On demand / filler cadence; contributor-requestable |

## 5. Visual style & sound

- `video/theme.ts` holds the entire look: app palette colors, pixel font,
  gotchi-pink/purple gradients, scanline/CRT flourish. All templates read from it —
  one file *is* the "new visual style" line item.
- Audio: per-template mood mapping into a CC0 chiptune pool; SFX set (equip blip,
  counter tick, sale cha-ching). Track choice = seeded hash of video ID (stable per
  video, varied across videos).

## 6. Megaphone (`/megaphone`)

A content-ops page with three access levels:

- **Public:** library of approved content packs — each pack = MP4 (or text post) +
  per-platform captions + copy/download buttons + share intents where the platform
  supports them. Anyone can grab a pack and post it from their own account
  ("amplify"). Posted-by-the-community counts are shown per pack.
- **Contributor (wallet-auth, Game Center pattern):** submit caption tweaks, propose
  new post text, request a FitReveal/Spotlight of a gotchi they own (rate-limited
  server render queue). Submissions enter the review queue.
- **Admin:** the content manager — review queue of generated + contributed items:
  full-res preview player, editable per-platform captions, approve/reject,
  download, "publish to /pulse" toggle (PulseRecap), schedule/post-now to official
  accounts, and a posted-where checklist (X / Discord / YouTube / TikTok / Reels)
  for platforms still posted manually.

**Content item lifecycle:** `generated | submitted → in_review → approved →
scheduled → posted` (+ `rejected`). Server store follows the games-store pattern;
rendered MP4s served as static files with metadata in the store.

**Official-account posting (phased in):**

| Platform | Mechanism | Notes |
|---|---|---|
| Twitter/X | API (free-tier writes) | Own account; threads + native video upload |
| YouTube | Data API upload (Shorts) | Official channel |
| Discord | Webhook to own server | Official Aavegotchi channels remain manual-paste (ToS) |
| TikTok / Reels | Manual via pack download | API posting out of scope v1 |

**/pulse relationship:** /pulse embeds only the latest approved PulseRecap (share/
download affordance). All ops live in /megaphone.

**Telegram:** notify-only ping ("new item in review → link"). No approval via Telegram.

## 7. Rollout phases

- **Phase 1 — the demo (DAO ammo):** engine + all four templates render locally via
  `remotion render`; produce several real videos from live data; post manually. The
  forum receipt is the videos + this repo.
- **Phase 2 — Megaphone v1 (admin) + weekly loop:** VPS cron renders PulseRecap
  weekly and SaleAlert on threshold sales → items land in Megaphone review queue;
  admin content manager (preview, captions, approve, download, posted-checklist,
  publish-to-/pulse); Telegram notify ping. Posting to platforms manual via packs.
- **Phase 3 — contributors + public packs:** public pack library with amplify flow;
  contributor submissions (captions/posts) and own-gotchi render requests
  (rate-limited queue). Game Center auth/approve machinery reused.
- **Phase 4 — official-account APIs:** Twitter/X + YouTube + Discord-webhook posting
  with scheduling; posted-checklist auto-updates for those platforms.

## 8. Error handling

- Prep scripts fail loudly and produce no props file on bad/missing data (no
  half-rendered videos from partial data).
- Asset cache misses re-fetch once, then fail the prep run — render never starts
  with placeholder art.
- Cron: a failed render skips that item's queue entry and logs; it must not block
  other items. /pulse keeps showing the previous week's video.
- Contributor render queue: per-wallet rate limit; render errors surface as a
  retryable message, not a stuck job.
- Official-account post failures: item stays `scheduled` with visible error; never
  silently marked `posted`.

## 9. Testing

- **Golden-frame snapshots:** render specific frame numbers per template from fixture
  props; pixel-compare against checked-in PNGs.
- **Prep unit tests:** data-shaping logic tested against recorded subgraph/pulse
  responses; no live network in CI.
- **Fixture props JSONs** checked into `video/fixtures/` so tests and golden frames
  never touch the network.
- **Megaphone server routes:** store + lifecycle transitions unit-tested
  (games-store test pattern); auth reuses Game Center's tested middleware.

## 10. Out of scope (v1)

- AI-generated video or audio.
- TikTok/Reels API posting (manual via packs).
- Auto-posting into official Aavegotchi Discord channels (manual paste only).
- Land/parcel or Gotchiverse 3D content — 2D gotchi/wearable art only.
- LLM-written scripts or captions at render time.
- Contributor-uploaded arbitrary video files (generated + text contributions only —
  keeps moderation surface small).
