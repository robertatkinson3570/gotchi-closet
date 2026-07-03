# gotchi video engine

Programmatic vertical videos (1080×1920) from live Aavegotchi data. Remotion.
Style = the site's neon-spectral dark mode (tokens in `src/theme.ts`, kept in
sync with `src/styles/globals.css` `.dark`).
Spec: `docs/superpowers/specs/2026-07-03-gotchi-video-engine-design.md`.

## One-time setup

```bash
cd video && pnpm install
pnpm exec tsx video/prep/genAudio.ts   # from repo root: synthesizes the audio
```

## Make a video (all prep from REPO ROOT, all renders from video/)

```bash
# Spotlight / FitReveal for any gotchi
pnpm exec tsx video/prep/spotlight.ts --gotchi 4285
pnpm exec tsx video/prep/fitReveal.ts --gotchi 4285
# Biggest sale of the week
pnpm exec tsx video/prep/saleAlert.ts --days 7
# Weekly pulse recap (PULSE_URL env to override prod, e.g. local dev server)
PULSE_URL=http://localhost:8787/api/pulse pnpm exec tsx video/prep/pulseRecap.ts

cd video
pnpm exec remotion render src/index.ts Spotlight out/spotlight-4285.mp4 --props=props/spotlight-4285.json
```

## Dev / preview

```bash
cd video && pnpm studio
```

## Tests

```bash
pnpm exec vitest run video/prep     # prep shaping units (repo root)
cd video && node scripts/golden.mjs # golden frames (--update to accept)
```

Audio is synthesized (`prep/genAudio.ts`). To upgrade, drop replacement CC0
files over `video/public/audio/*.wav` — same names, no code change.
