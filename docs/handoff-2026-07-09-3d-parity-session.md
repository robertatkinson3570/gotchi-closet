# Session handoff: dapp parity, site-wide 3D, composition service (2026-07-09)

Full context for any agent picking this up. Everything here was verified empirically
in-session; claims marked VERIFIED had a passing test or on-screen confirmation.

## Deploy state

- **Deployed to prod** (Vercel www.gotchicloset.com + VPS api.gotchicloset.com), commits
  `0a95e9c` (feature batch), `7a1b7d5` (artifact cleanup), `9b5acce` (Vercel build fix),
  `5e2f0bc` (grid composed fallback). VPS deploys automatically via the
  `deploy-autorenew.yml` self-hosted-runner workflow on `server/**` pushes.
- **Uncommitted local work (DO NOT lose)**: composer fixes in `server/gotchi3d/compose.ts`
  (plain merges, no dedup, atomic cache writes), `src/components/viewer3d/Gotchi3D.tsx`
  (pre-resolution + instant-poster-then-composed-upgrade), `scripts/sweep3d.ts`,
  `@gltf-transform/extensions` added to deps (currently unused, fine to keep or drop).
  User said stop auto-pushing; deploy only when they ask.
- Vercel build is plain `pnpm build`. `pnpm build:vercel` (prerender) blocked the first
  deploy and was reverted; `scripts/prerender.ts` works locally and should become a
  scheduled job (GitHub Action) rather than a build step.

## What shipped this session (all verified)

1. **Dapp parity**: parcel auction details panel (district/size/coords/installations/
   tiles/survey/aaltar + alchemica boost/remaining/claimed), last-sold with Polygon-era
   fallback, GBM incentive tiers, timestamped bids, .gotchi names, auction History panel,
   market modal floor/highest-offer/seller, consumable names, forge metadata everywhere
   (`src/lib/explorer/forgeMeta.ts`, contract-verified, unit-tested), /u Inventory tab,
   activity CSV export, footer socials + SiteCrawlIQ badge.
2. **SEO/GEO/AEO**: sitemap was pointing at dead gotchicloset.xyz, fixed to .com (489
   URLs incl. 12 new `/guides/*` pages), llms.txt, AI-crawler robots.txt, crawler-visible
   index.html shell (hidden from humans, `.gc-static-shell`), JSON-LD fixed app-wide
   (react-helmet-async drops `dangerouslySetInnerHTML` on script tags; must use string
   children, see `src/components/Seo.tsx`).
3. **Site-wide 3D** (the big one, details below).
4. **Voxel wearables**: 162/418/419/420 had no official 3D; built via
   `scripts/buildVoxelWearables.mjs` + `scripts/voxel-grids.json` into
   `public/models3d/*.glb`, served via `LOCAL_WEARABLE_3D` in `src/lib/gotchi3d.ts`.

## 3D system architecture

- **Toggle**: `src/app/View3DProvider.tsx` + nav cube `View3DToggle`. Persisted
  localStorage `gotchicloset-view3d`, off by default.
- **Hash derivation** (`src/lib/gotchi3d.ts`, regression tests in `gotchi3d.test.ts`):
  `<CollateralName>-<EyeShape>-<EyeColor>-body-face-eyes-head-RIGHThand-LEFThand-pet`.
  Contract `equippedWearables`: index 4 = LEFT, 5 = RIGHT, so the hash swaps them.
  CRITICAL: the render CDN cache is INCONSISTENT about hand order (gotchi #19095 cached
  right-left, #15995 cached left-right, both VERIFIED via Pixelcraft's batch API), so
  `gotchi3dHashes()` returns BOTH orderings and callers try each.
- **Model sources ladder** (in `Gotchi3D.tsx`): official dressed CDN render (both hand
  orders) -> our composed model -> naked body -> 2D. Pre-resolved with plain fetches
  (`gcprobe=1` + `no-store`) because model-viewer error events CANNOT drive fallbacks
  (see gotchas). Poster grids show the instant PNG result immediately, then upgrade in
  place to the composed model when ready.
- **Composition service** (`server/gotchi3d/compose.ts` + `/api/gotchi3d/composed/:hash`):
  builds dressed GLBs Pixelcraft never rendered. **v2 (2026-07-09 late session,
  VERIFIED end-to-end via Playwright): hand wearables are DONOR-GRAFTED, not merged.**
  - NON-HAND wearables (body/face/eyes/head/pet): official dressed GLBs place them at
    identity under WearableRoot, byte-identical to the standalone GLBs -> plain merges
    are correct (unchanged from v1).
  - HAND wearables: the standalone GLBs at dapp.aavegotchi.com are RAW PREFAB MESHES in
    arbitrary local spaces (212 = 0.017-unit speck, 217 = world-authored on the LEFT
    arm, 315 = upside down at the feet, 386 = 2.6-unit rod at origin). That was the
    whole "missing / floating hand items" bug. Official models attach them under the
    body rig's hand sockets (`{Melee,Sheild(L)/Shield(R),Grenade,Ranged}Socket_{L,R}`,
    present in every naked body GLB) via a `Wearable_Mesh_<id>(Clone)` subtree carrying
    item-specific assembly transforms (x100 prefab roots etc). Those transforms exist
    ONLY in official dressed GLBs, so the composer grafts the clone subtree from a
    DONOR official render into the target's matching socket.
  - Donor map: `server/gotchi3d/hand-donors.json` (committed), rebuilt by
    `npx tsx scripts/buildHandDonors.ts` (scans subgraph for all worn hand AND PET
    items, probes the CDN for a render containing each). 2026-07-09: 99/100 items
    have donors; item 315 has NO official render anywhere (wearers: 3052, 13681, 12518).
  - SIDE MAPPING (cost real time; verified on Felon #19095's GLB + Artemis 2D): the
    contract/hash RIGHT-hand item is physically mounted on the rig's Hand_L and
    appears on the VIEWER'S RIGHT, exactly where the 2D SVG draws it. Mapping it to
    Hand_R renders every two-handed outfit mirrored vs 2D.
  - PETS graft too: standalone pet GLBs are authored centered at the origin and
    render HIDDEN INSIDE the body if root-merged. Official renders hang them off
    `Geometry/PetRoot` (t≈[1.15,0,1.27]); the graft wraps root-kind clones in a node
    carrying the donor parent's world transform to preserve that placement.
  - Three official flavors, all handled: socketed props (laptops/wands/signs; graft
    into same socket type + side, re-hang between Left/RightHandRoot when donor side
    differs), WearableRoot-style skinned pieces (gloves/arm covers, e.g. 217; graft
    once at scene root even if in both hands), and PetRoot pets.
  - Frontend ladder (Gotchi3D.tsx): official PRIMARY hash -> composed -> official
    ALT-ordering -> naked. Alt-ordering renders are demoted below composed because
    the CDN's swapped-hash renders have the hands PHYSICALLY MIRRORED vs 2D
    (verified: Immaterial #16559 only exists as 52-0-17-0, item on the wrong hand);
    poster grids upgrade in place from an alt poster to the live composed model.
  - Hand items with NO donor: `MANUAL_HAND_ASSEMBLY` in compose.ts places the
    standalone GLB into a socket by hand (315 Haanzo Katana -> MeleeSocket; its
    own node transform already matches the Spirit Sword 311 socket-space pose).
    Anything neither donored nor manual is SKIPPED (missing beats floating
    garbage) and self-heals when Pixelcraft's generator returns.
  - Rooted ONE-SIDED pieces (217 Energy Gun is baked on the gotchi's left arm):
    when the target wears them on the OTHER contract hand than the donor did,
    the graft mirrors across X + flips triangle winding (plain negative scale
    alone gets backface-culled). Donor side read from the donor hash.
  - Donor probing validates actual GLB magic bytes ("glTF"), not just HTTP 200:
    the proxy returned transient 200s for missing renders and poisoned item 51's
    first donor entry. `fetchDonorGlb` re-validates at fetch time.
  - Stray-geometry envelope clip: meshes ENTIRELY outside x/z ±3.5, y -0.75..4.5
    are dropped (Wizard Hat 63 ships a "MagicDust" particle mesh ~10 units below
    the floor; harmless to Pixelcraft's fixed camera but it made model-viewer's
    auto-framing zoom out until the gotchi rendered tiny — Winklevoss #8845).
  - Naked-body fallback: when the exact naked hash was never rendered, compose
    from an eye-COLOR sibling (same collateral + eye shape; tint-only diff).
    Unlocked Jo #9369, which could never render at all.
  - Size pass (rendering speed): texture-only dedup (both-hands grafts duplicate
    images; node/skin dedup stays OFF — that was the historical crash), weld, and
    textureCompress({resize:[1024,1024]}) which works WITHOUT sharp (pure-JS
    ndarray path). NO quantize(): its output HANGS three.js on some combos
    (verified: Immaterial #16559 never fired load with it, instant without).
    Composed files ~4.6MB avg -> ~1.3-3MB, load 0.4-1.2s warm.
  - Transient-failure guard: fetch timeouts/junk bodies mark the compose partial;
    partial output serves once from *_GLB.partial.glb and is NEVER cached (a
    flaky fetch once pinned a gotchi without its eye wearable forever). Plain
    403/404 = the CDN definitively lacks the asset, safe to bake into the cache.
  - PREFER_DONOR_SLOTS: body/face/eyes/head ids whose STANDALONE GLB is degraded
    graft from donors instead (368 Beard of Divinity ships untextured). NOTE:
    the official GLB's beard is ALSO plain white in model-viewer; the grey look
    on poster cards is Pixelcraft's PNG lighting, not a model difference.
  - Same item both hands (socketed): graft twice, one per socket — official models
    show it in both hands (verified vs Grace Hopper #23881's official GLB).
  - Face wearable equipped: remove the default mouth node (/smile|mouth/i).
  - Strip ALL skins/JOINTS_0/WEIGHTS_0/animations (skinned parts crash three.js after
    merge: "matrixWorld of undefined").
  - Transforms: `prune()` + `unpartition()` only. NO `dedup()` (false lead but left out).
  - Do NOT register gltf-transform KHRONOS_EXTENSIONS (made output hang; VERIFIED).
  - Cache to `server/data/gotchi3d-cache/` (gitignored; donors cached as `donor-*`),
    atomic tmp+rename writes.
  - Wearables without official GLBs (Base-era 414+, except our voxel 4) are skipped;
    partial outfit beats naked.
  - **Browser-cache poisoning fix**: the composed route used to send
    `Cache-Control: public, max-age=86400`, which PINNED pipeline-broken GLBs in every
    visitor's browser for a day (server-side cache purges + redeploys were invisible —
    this is why "same issue" persisted after deploys). Route now sends `no-cache` +
    ETag (304s for unchanged files) and the frontend requests `?v=2` to bust old
    entries. Bump the version param if the pipeline ever changes output again (currently ?v=3: correct hand sides + donor-positioned pets).
- **Render-kick** (`/api/gotchi3d/kick`): relays force-render requests to Pixelcraft's
  batch API (no CORS, needs the server hop). Their generator currently 502s (down since
  the wind-down); kicks are no-ops until it returns, then gaps self-heal.
- **Posters**: grids render CDN PNG (`_Full.png`) via the aavegotchi.com asset proxy,
  zero WebGL; live scenes only in modals or on the per-card rotate button. Composed
  models have NO PNG (no server GPU); grid cards fall through to a live composed viewer.

## Hard-won gotchas (each cost real time; do not rediscover)

1. **model-viewer is a lazy custom element.** Injecting `<model-viewer>` into a page
   where the app has not loaded it produces an inert tag that never fires events. Hours
   of false "HANG" readings. In dev, register first:
   `await import('/@id/@google/model-viewer')`.
2. **model-viewer error events are unreliable for fallback ladders**: its singleton
   renderer re-dispatches a previous src's failure onto the replacement element. Never
   step a ladder on its error event; pre-resolve sources with plain fetches.
3. **Range-probe cache poisoning**: a cached 1-byte 206 for URL X makes model-viewer's
   subsequent full fetch of X hang forever. Probes must use a distinct query param
   (`gcprobe=1`) + `cache: no-store`.
4. **tsx does not hot-reload** `server/**`. Restart `npm run dev` after server edits, and
   TaskStop/killing npm leaves ORPHANED tsx/vite children holding 5000/8787 (known repo
   gotcha): kill listeners by port before restarting or new routes silently 404.
5. **Explorer deep link** `?asset=gotchi&id=N` sometimes lands on "No gotchis found"
   (search filter race, pre-existing). Grid + card click works.
6. **Pixelcraft renderer is offline** (batch force -> 502, dapp's own 3D shows Coming
   Soon/500s). Only pre-rendered combos + our composer produce dressed models.
7. `git add -A` will grab session screenshots/`.superpowers/` if not ignored; both now
   gitignored.
8. Vercel MCP token lacks this team's scope; watch deploys by polling prod for a build
   marker (`gc-static-shell` in raw HTML) or the dashboard.

## Verification playbook

- Sweep any gotchis end-to-end: `npx tsx scripts/sweep3d.ts 3052 7001 ...` (prints
  official/composed status + hash per gotchi; needs local server on 8787).
- Known-good test hashes: Snoop `USDC-RareHigh2-Rare_Low-258-263-214-30-212-212-156`,
  Fren$ki `USDT-RareHigh1-Rare_High-46-414-215-45-70-47-417`, Felon official
  `USDC-MythicalLow1_H2-Rare_High-258-260-259-161-17-75-238`.
- Browser load-test snippet: register the element (gotcha 1), create model-viewer,
  listen for load/error with a timeout. Always run an OFFICIAL model as control first.
- Final sweep result (2026-07-09, VERIFIED): all 15 user-reported gotchis pass; 8 via
  official renders, 7 via composition, hand items visually correct vs 2D.
- Full gates: `npx tsc --noEmit`, `npx vitest run` (764 tests), `npx vite build`.

## Open items, in priority order

1. **Dress page: locking a gotchi flips it to 2D** (user-reported, unfixed). Likely the
   locked path renders a gotchi object missing collateral/traits fields so
   `gotchi3dHashes()` returns []. Start at the lock state in `EditorPanel.tsx` /
   `GotchiCard.tsx` / `useAppStore`.
2. **Deploy the local batch** (donor-graft composer v2 + no-cache route + `?v=2` ladder
   + `hand-donors.json`) when the user asks. Remember: purge the VPS
   `server/data/gotchi3d-cache/` on deploy (old files were built by the pre-socket
   pipeline). Browser-side, `?v=2` handles returning visitors automatically.
2b. Item 315 (worn by 3052 RAREPEPE, 13681 Artemis, 12518) has no official render on
   the whole CDN, so composed models omit it until Pixelcraft's generator returns.
3. Prerender as a nightly GitHub Action (script ready, run over sitemap hubs).
4. Poster PNGs for composed models (needs headless GL on VPS) so grids show composed
   outfits without live scenes: optional polish.
5. Multi-currency buy (GHST/USDC/ETH): fully speced in
   `audit-results/polygon-history-and-multicurrency-research.md` (one-tx diamond facet
   `swapAndBuyERC721` 0xfc45790c / `swapAndBuyERC1155` 0x0df1c37a). Money path: build
   carefully with a real-wallet test.
6. SEO follow-through (user actions): GSC/Bing sitemap resubmit, 301 gotchicloset.xyz,
   directory listings (aavegotchi.com/tools, wiki, DappRadar). Guides + llms.txt live.
7. Remaining research artifacts: `audit-results/dapp-sweep-2026-07-09.md` (unbuilt parity
   roadmap: profile inventory extras, auction stats parity, FakeGotchi filters),
   `audit-results/dapp-3d-research.md` (3D pipeline reverse-engineering, URL schemes,
   CORS map), `seo-output/*` (strategy docs).

## Key endpoints and files

- `GET /api/gotchi3d/composed/:hash` (compose + cache), `POST /api/gotchi3d/kick`.
- Render CDN: `https://dzqjok0x69zbl.cloudfront.net/<hash>/<hash>_GLB.glb` (no CORS) via
  proxy `https://www.aavegotchi.com/api/renderer/assets?url=<enc>` (ACAO *).
- Wearable GLBs: `https://dapp.aavegotchi.com/brand/items/3d/<id>.glb` (ACAO *; 297 of
  449 exist; local voxel 4 in `public/models3d/`).
- Polygon-era history: `.../aavegotchi-core-matic/prod/gn` (keyless, still indexing).
- Core 3D files: `src/lib/gotchi3d.ts`, `src/components/viewer3d/{Gotchi3D,
  ModelViewer3D, Wearable3DThumb}.tsx`, `server/gotchi3d/compose.ts`,
  `server/routes/gotchi3d.ts`.
