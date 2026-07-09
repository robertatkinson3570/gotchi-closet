/**
 * 3D model resolution for gotchis and wearables, mirroring the dapp's own
 * pipeline (reverse-engineered + verified 2026-07-09, full notes in
 * audit-results/dapp-3d-research.md):
 *
 * - Wearables: standalone GLBs at dapp.aavegotchi.com/brand/items/3d/{id}.glb
 *   (ACAO: *, ~200-550 KB). 297 of 449 ids exist; the gaps are almost all
 *   non-equippable badges.
 * - Gotchis: pre-composed GLBs on CloudFront keyed by a deterministic hash of
 *   collateral + eye traits + equipped wearables (derivation published in
 *   aavegotchi/aavegotchi-3d-render-skill). CloudFront has no CORS, so loads
 *   go through the dapp's asset proxy (ACAO: *). Not every combo is cached
 *   (~87% of sampled real gotchis) and the render generator is currently
 *   offline, so callers MUST fall back to the 2D SVG on load error.
 */

// Anchor validated against the dapp: gotchi #19634 (amWMATIC, eyes 7/98,
// naked) => "Polygon-RareLow3-Mythical_High-0-0-0-0-0-0-0".

const GOTCHI_3D_CDN = "https://dzqjok0x69zbl.cloudfront.net";
const ASSET_PROXY = "https://www.aavegotchi.com/api/renderer/assets?url=";

/** Collateral address -> render name used inside the 3D hash. */
const COLLATERAL_RENDER_NAME: Record<string, string> = {
  // Haunt 1 (maTokens)
  "0x20d3922b4a1a8560e1ac99fba4fade0c849e2142": "Eth", // maWETH
  "0x823cd4264c1b951c9209ad0deaea9988fe8429bf": "Aave", // maAAVE
  "0x98ea609569bd25119707451ef982b90e3eb719cd": "Link", // maLINK
  "0xe0b22e0037b130a9f56bbb537684e6fa18192341": "Dai", // maDAI
  "0xf4b8888427b00d7caf21654408b7cba2ecf4ebd9": "USDT", // maUSDT
  "0x8c8bdbe9cee455732525086264a4bf9cf821c498": "Uni", // maUNI
  "0x9719d867a500ef117cc201206b8ab51e794d3f82": "USDC", // maUSDC
  "0xdae5f1590db13e3b40423b5b5c5fbf175515910b": "USDC", // maUSDC (alt)
  "0xf52b3250e026e0307d7d717ae0f331baaa4f83a8": "TUSD", // maTUSD
  "0xe20f7d1f0ec39c4d5db01f53554f2ef54c71f613": "Yfi", // maYFI
  // Haunt 2 (amTokens)
  "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390": "wEth", // amWETH
  "0x1a13f4ca1d028320a707d99520abfefca3998b7f": "USDC", // amUSDC
  "0x27f8d03b3a2196956ed754badc28d73be8830a6e": "Dai", // amDAI
  "0x60d55f02a771d515e077c9c2403a1ef324885cec": "USDT", // amUSDT
  "0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4": "Polygon", // amWMATIC
  "0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360": "Aave", // amAAVE
  // amWBTC (verified: 135 live gotchis use this address; Kornholio #23192's
  // dressed render exists under the wBTC- prefix)
  "0x5c2ed810328349100a66b82b78a1791b101c9d61": "wBTC",
  "0x0ca2e42e8c21954af73bc9af1213e4e81d6a669a": "wBTC", // legacy alias
};

/** Eye-shape token for trait values 98-99 (collateral-specific eyes). */
const COLLATERAL_EYE_SHAPE: Record<string, string> = {
  Eth: "ETH", Aave: "AAVE", Dai: "DAI", Uni: "UNI", Polygon: "POLYGON",
  Link: "LINK", wEth: "wETH", Yfi: "YFI", wBTC: "wBTC", TUSD: "TUSD",
  USDC: "USDC", USDT: "USDT",
};

function eyeShapeToken(value: number, hauntId: number, collateralName: string): string | null {
  const v = Math.max(0, Math.min(99, value));
  if (v === 0) return hauntId === 2 ? "MythicalLow1_H2" : "MythicalLow1_H1";
  if (v === 1) return hauntId === 2 ? "MythicalLow2_H2" : "MythicalLow2_H1";
  if (v <= 4) return "RareLow1";
  if (v <= 6) return "RareLow2";
  if (v <= 9) return "RareLow3";
  if (v <= 14) return "UncommonLow1";
  if (v <= 19) return "UncommonLow2";
  if (v <= 24) return "UncommonLow3";
  if (v <= 41) return "Common1";
  if (v <= 57) return "Common2";
  if (v <= 74) return "Common3";
  if (v <= 79) return "UncommonHigh1";
  if (v <= 84) return "UncommonHigh2";
  if (v <= 89) return "UncommonHigh3";
  if (v <= 92) return "RareHigh1";
  if (v <= 94) return "RareHigh2";
  if (v <= 97) return "RareHigh3";
  return COLLATERAL_EYE_SHAPE[collateralName] ?? null; // 98-99
}

function eyeColorToken(value: number): string {
  const v = Math.max(0, Math.min(99, value));
  if (v <= 1) return "Mythical_Low";
  if (v <= 9) return "Rare_Low";
  if (v <= 24) return "Uncommon_Low";
  if (v <= 74) return "Common";
  if (v <= 90) return "Uncommon_High";
  if (v <= 97) return "Rare_High";
  return "Mythical_High";
}

export type Gotchi3DInput = {
  collateral: string;
  hauntId: number;
  /** BASE numeric traits (eyes are immutable; wearable modifiers don't apply). */
  numericTraits: number[];
  equippedWearables: number[];
};

/** Deterministic render hash for a gotchi's 3D model; null when underivable
 *  (unknown collateral / missing traits) — caller falls back to 2D. */
export function gotchi3dHash(g: Gotchi3DInput): string | null {
  const collateral = COLLATERAL_RENDER_NAME[(g.collateral || "").toLowerCase()];
  if (!collateral) return null;
  if (!Array.isArray(g.numericTraits) || g.numericTraits.length < 6) return null;
  const shape = eyeShapeToken(Number(g.numericTraits[4]) || 0, g.hauntId, collateral);
  if (!shape) return null;
  const color = eyeColorToken(Number(g.numericTraits[5]) || 0);
  const w = (i: number) => Number(g.equippedWearables?.[i]) || 0;
  const slots = [w(0), w(1), w(2), w(3), w(5), w(4), w(6)];
  return `${collateral}-${shape}-${color}-${slots.join("-")}`;
}

/**
 * All plausible render hashes for a gotchi, most-likely first. The CDN cache
 * is inconsistent about hand order (verified 2026-07-09: gotchi #19095 is
 * cached as head-RIGHT-LEFT-pet while #15995 is cached as head-LEFT-RIGHT-pet),
 * so when the hands differ both orderings must be tried before concluding the
 * dressed model doesn't exist. Background (slot 7) is never part of the hash.
 */
export function gotchi3dHashes(g: Gotchi3DInput): string[] {
  const primary = gotchi3dHash(g);
  if (!primary) return [];
  const w = (i: number) => Number(g.equippedWearables?.[i]) || 0;
  if (w(4) === w(5)) return [primary];
  const swappedHands = [...(g.equippedWearables ?? [])];
  [swappedHands[4], swappedHands[5]] = [w(5), w(4)];
  const alt = gotchi3dHash({ ...g, equippedWearables: swappedHands });
  return alt && alt !== primary ? [primary, alt] : [primary];
}

/** GLB URL for a gotchi hash, via the CORS-open asset proxy (CloudFront
 *  itself sends no ACAO header). */
export function gotchi3dGlbUrl(hash: string): string {
  return ASSET_PROXY + encodeURIComponent(`${GOTCHI_3D_CDN}/${hash}/${hash}_GLB.glb`);
}

/** Rendered PNG for the same hash — used as the model-viewer poster. */
export function gotchi3dPosterUrl(hash: string): string {
  return ASSET_PROXY + encodeURIComponent(`${GOTCHI_3D_CDN}/${hash}/${hash}_Full.png`);
}

// Wearables with no official GLB that we voxel-extruded ourselves from the
// canonical pixel art (scripts/buildVoxelWearables.mjs → public/models3d/).
const LOCAL_WEARABLE_3D = new Set([162, 418, 419, 420]);

/** Standalone wearable display model: self-hosted voxel build when the
 *  official CDN never received one, otherwise the official GLB (ACAO: *). */
export function wearable3dGlbUrl(id: number | string): string {
  const n = Number(id);
  if (LOCAL_WEARABLE_3D.has(n)) return `/models3d/${n}.glb`;
  return `https://dapp.aavegotchi.com/brand/items/3d/${id}.glb`;
}

// Ids with no GLB, from a full HEAD scan of 1-450 (2026-07-09) — almost all
// badges. Everything outside 1-449 is also unavailable.
const WEARABLE_3D_MISSING: [number, number][] = [
  [126, 129], [162, 198], [210, 210], [264, 291], [316, 349], [388, 403], [418, 450],
];

export function hasWearable3D(id: number | string): boolean {
  const n = Number(id);
  if (LOCAL_WEARABLE_3D.has(n)) return true;
  if (!Number.isInteger(n) || n < 1 || n > 449) return false;
  return !WEARABLE_3D_MISSING.some(([lo, hi]) => n >= lo && n <= hi);
}
