# How the Aavegotchi dapp does 3D (research, 2026-07-09)

Research only, no code changes. Method: downloaded all ~1,350 Next.js chunks from
dapp.aavegotchi.com (webpack runtime chunk map), grepped them, drove the live site with
Playwright (repo's own playwright install), exercised the renderer APIs with curl, and
read the official `aavegotchi/aavegotchi-3d-render-skill` repo.

## 1. Library: @google/model-viewer (web component), NOT three/drei/babylon/unity

The dapp injects model-viewer at runtime from unpkg (chunk `86737.5d83442fb753a3c5.js`):

```js
e.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"; e.type = "module"
// then:
<model-viewer expose-scene-graph src={glbUrl} poster={svgOrPng} loading="eager" preload
  reveal="auto" rotation-per-second="30deg" camera-orbit="0deg 75deg ...">
```

No three.js/react-three-fiber/babylon/unity anywhere in the bundle. Assets are plain
binary glTF (`glTF` magic verified).

The 3D/2D pill (component in `23571.7c99d19399b97233.js`) is enabled as
`y = (category === "wearables") || (category === "aavegotchis" && isDrilldown)`.
So: wearables get 3D everywhere; gotchis get 3D only in the drilldown modal (which has a
third "sprite" option). In list/auction cards the 3D side is disabled and clicking it
shows "Coming Soon!" (verified live: auction modal shows COMING SOON, the inventory
drilldown `?itemType=aavegotchis&id=<tokenId>` shows 3D | 2D | SPRITE).

## 2. Asset URL schemes

### Wearables — option (b)-ish: one static GLB per wearable, hosted in the dapp's public folder

```
https://dapp.aavegotchi.com/brand/items/3d/{wearableId}.glb   (also on www.aavegotchi.com)
poster: https://dapp.aavegotchi.com/brand/items/{wearableId}.svg
```

Rendered directly in `<model-viewer>` (chunk `69927`), with an explicit exclusion for
id 210. These are standalone display models (item on a turntable), not runtime-attachable
rig pieces.

### Gotchis — option (a): one pre-composed GLB per trait+wearable combination, from a renderer service

The gotchi model is composed server-side (AWS Fargate task) and cached on a public
CloudFront bucket, keyed by a deterministic "gotchi hash":

```
hash = {Collateral}-{EyeShape}-{EyeColor}-{body}-{face}-{eyes}-{head}-{rightHand}-{leftHand}-{pet}
e.g.   Polygon-RareLow3-Mythical_High-0-0-0-0-0-0-0        (gotchi #19634, naked)
       wEth-UncommonHigh2-Mythical_Low-230-0-0-228-229-0-0 (dressed)

GLB:  https://dzqjok0x69zbl.cloudfront.net/{hash}/{hash}_GLB.glb
PNG:  https://dzqjok0x69zbl.cloudfront.net/{hash}/{hash}_Full.png   (also _Headshot)
```

Hash derivation (fully documented in the official repo
`github.com/aavegotchi/aavegotchi-3d-render-skill`, `scripts/render-gotchi-bypass.mjs`):
- Collateral: map `gotchi.collateral` address -> Eth/Aave/Dai/USDC/Link/USDT/TUSD/Uni/Yfi/Polygon/wEth/wBTC
- EyeShape from numericTraits[4] + hauntId: 0->MythicalLow1_H1|_H2, 1->MythicalLow2_H1|_H2,
  2-4 RareLow1, 5-6 RareLow2, 7-9 RareLow3, 10-14/15-19/20-24 UncommonLow1-3,
  25-41/42-57/58-74 Common1-3, 75-79/80-84/85-89 UncommonHigh1-3, 90-92/93-94/95-97 RareHigh1-3,
  98-99 -> collateral-specific shape (ETH/AAVE/DAI/UNI/POLYGON/LINK/wETH/YFI/wBTC/TUSD/USDC/USDT)
- EyeColor from numericTraits[5]: 0-1 Mythical_Low, 2-9 Rare_Low, 10-24 Uncommon_Low,
  25-74 Common, 75-90 Uncommon_High, 91-97 Rare_High, 98-99 Mythical_High
- Wearable slots = `equippedWearables[0..6]` (body,face,eyes,head,rightHand,leftHand,pet).
  Background (slot 7) is NOT part of the hash.

All inputs come from the core subgraph (`collateral hauntId numericTraits equippedWearables`),
which GotchiCloset already queries.

Dapp client flow (chunks `26369`/`31431`, hook `useAavegotchi3dModel`):
1. `POST /api/renderer/parse/ids {tokenIds:[...]}` -> gotchiHash (we can skip this: derive locally)
2. `POST /api/renderer/get {hash, renderType:"GLB_3DModel"|"PNG_Full", waitForCompletion:true}`
   (the official skill uses the richer `POST https://www.aavegotchi.com/api/renderer/batch`
   `{hashes:[...], renderTypes:["GLB_3DModel","PNG_Full","PNG_Headshot"], force?, verify?}`)
3. Client loads the GLB through the dapp's proxy `/api/renderer/assets?url=<encoded CloudFront URL>`
4. Results cached in localStorage `aavegotchi_render_cache_v1` (keyed per token, includes a
   wearablesKey so a re-dress triggers re-fetch; capped at 200 entries)

It is NOT an iframe/embedded viewer; no verse/3d subdomain is involved.

## 3. Availability + CORS (all verified with curl today)

Wearable GLBs (`dapp.aavegotchi.com/brand/items/3d/{id}.glb`):
- 200, `Content-Type: model/gltf-binary`, **`Access-Control-Allow-Origin: *`** -> hotlinkable
  from gotchicloset.com directly, no proxy needed.
- Sizes sampled: id 1 = 511 KB, 105 = 465 KB, 300 = 251 KB, 350 = 220 KB (~200-550 KB each).

Gotchi GLBs (CloudFront `dzqjok0x69zbl.cloudfront.net`):
- 200, `Content-Type: binary/octet-stream`, **NO ACAO header** (even with an Origin header)
  -> direct browser fetch from gotchicloset.com is CORS-blocked.
- BUT the dapp's asset proxy `https://www.aavegotchi.com/api/renderer/assets?url=<encoded>`
  returns **`Access-Control-Allow-Origin: *`** (verified with `Origin: https://gotchicloset.com`)
  -> usable cross-origin today, at the cost of depending on Pixelcraft's infra.
- `POST /api/renderer/batch` has NO CORS headers (preflight 204 without ACAO) -> cannot be
  called from the browser; must be called server-side (our VPS) if we want availability checks.
- Sizes: naked gotchi GLB = 664 KB; a fully-dressed sample = **7.25 MB**. Budget accordingly
  (lazy-load on toggle only, keep poster image up while loading).

Renderer service status (important):
- The **generation** upstream is currently DOWN: `force:true` kickoff -> 502 "fetch failed";
  the dapp's own `/api/renderer/parse/ids` -> 500 "fetch failed" (captured live from the real
  dapp UI via Playwright, gotchi #19634 drilldown). Even dapp.aavegotchi.com cannot render new
  combos right now (fits the post-Pixelcraft wind-down / GV3D-offline context).
- The **verify + cached assets** path works fine: `{verify:true}` returns per-hash
  `urls`, `proxyUrls`, `availability:{GLB_3DModel:{status,exists}}`; missing hash -> 403/exists:false.

## 4. Coverage

Wearables: scanned ids 1-450 with HEAD. **297 of 449 have GLBs.** Missing: 126-129,
162-198, 210, 264-291, 316-349, 388-403, 418-450 — these ranges are almost entirely
badges (non-equippable), so equippable-wearable coverage is effectively complete except
id 210. No manifest file; derive availability by HEAD (cache the result) or ship the
known-good id list from `audit-results` (this scan) as a constant.

Gotchis: hash-keyed cache, cannot enumerate. Sampled 30 real Base gotchis (20 dressed,
10 naked) via subgraph -> derived hashes -> batch verify: **26/30 (87%) already on the CDN.**
Misses cluster on rarer combos (2 of 4 misses were MythicalLow1_H2 eye shapes). Since the
generator is down, misses cannot currently be filled; fall back to 2D SVG.

## 5. Licensing note

`aavegotchi/aavegotchi-3d-render-skill` has **no license file**; the GLB art assets carry
no stated license either. Displaying gotchis/wearables to their owners inside a companion
dapp matches how the ecosystem treats the SVG art (which GotchiCloset already renders),
but redistribution/re-hosting of the 3D art is not explicitly licensed.

## 6. Recommended integration for GotchiCloset (Vite + React)

Lowest-bundle-cost path, mirrors the dapp exactly:

1. **Viewer**: `npm i @google/model-viewer`, `await import('@google/model-viewer')` inside a
   lazy `React.lazy`/dynamic-import 3D panel so the ~210 KB gz web component never touches the
   main bundle. Use the same attributes the dapp uses (`camera-controls auto-rotate
   rotation-per-second="30deg" poster={currentSvg}`); `<model-viewer>` is a plain custom
   element, trivially usable from React (add a `declare global` JSX typing).
2. **Wearables**: `src="https://dapp.aavegotchi.com/brand/items/3d/{id}.glb"` directly
   (ACAO:*). Hide the toggle for badge ids / id 210 / anything in the missing-id list.
3. **Gotchis**: derive the hash client-side from data we already have
   (collateral, hauntId, numericTraits[4], numericTraits[5], equippedWearables[0..6]) using the
   tables above; then either
   - zero-backend: `src="https://www.aavegotchi.com/api/renderer/assets?url=" +
     encodeURIComponent("https://dzqjok0x69zbl.cloudfront.net/{hash}/{hash}_GLB.glb")`
     and on model-viewer `error` event fall back to the 2D SVG; or
   - more robust (recommended): add a tiny VPS route `GET /api/gotchi3d/:tokenId` that derives
     the hash, calls `POST www.aavegotchi.com/api/renderer/batch {verify:true}` (or HEADs
     CloudFront), and 302s/streams the GLB with our own ACAO + long cache. This removes the
     dependency on Pixelcraft's Vercel proxy surviving the wind-down; the CloudFront bucket
     itself is the asset of record.
4. **UX guardrails**: only fetch on 3D-toggle click (dressed models are up to ~7 MB); keep the
   2D SVG as poster; localStorage-cache hash->exists results like the dapp does.
5. **Don't build**: any runtime wearable-attachment system. The ecosystem's own model is
   pre-composed GLBs; wearable GLBs are standalone display pieces, not rig attachments.

## Key artifacts (scratchpad, this session)

- Chunk corpus + greps: scratchpad `chunks/` (1,350 files)
- Live capture: `capture3d.json`, `inv3.png` (drilldown with 3D|2D|SPRITE toggle firing
  `/api/renderer/parse/ids` -> 500)
- Wearable scan: `glb-coverage.txt` (id -> HTTP status, 1-450)
- Official script copy: `render-gotchi-bypass.mjs`
- Gotchi coverage sampler: `coverage.mjs` (26/30 hit)
