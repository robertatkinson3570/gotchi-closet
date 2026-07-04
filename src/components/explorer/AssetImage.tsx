import { useEffect, useState } from "react";

// Aavegotchi brand asset CDN (verified against the live dapp's marketplace).
const BRAND = "https://dapp.aavegotchi.com/brand";

export const itemImageCandidates = (id: string | number) => [`${BRAND}/items/${id}.svg`];

// Forge assets (schematics, alloy, essence, geodes, cores) live under a dedicated
// CDN path keyed by rarity/slot — NOT by tokenId like wearables. A schematic's
// tokenId equals its target wearable id, but its art is a distinct blueprint SVG
// (so `/brand/items/{id}.svg` wrongly renders the finished wearable). Alloy /
// essence / geode / core token ids are ≥ 1e9 and have no `/items/*` art at all.
// ID→asset scheme verified 2026-07-04 against the live dapp forge inventory.
const FORGE_RARITIES = ["common", "uncommon", "rare", "legendary", "mythical", "godlike"];
const FORGE_CORE_SLOTS = ["body", "face", "eyes", "head", "hands", "pet"];
export const forgeImageCandidates = (id: string | number): string[] => {
  const n = Number(id);
  if (n < 1_000_000_000) return [`${BRAND}/forge/schematic_${n}.svg`];
  if (n === 1_000_000_000) return [`${BRAND}/forge/alloy.svg`];
  if (n === 1_000_000_001) return [`${BRAND}/forge/essence.svg`];
  if (n <= 1_000_000_007) {
    const rarity = FORGE_RARITIES[n - 1_000_000_002];
    return rarity ? [`${BRAND}/forge/geode_${rarity}.svg`] : [];
  }
  const offset = n - 1_000_000_008; // cores: 6 slots × 6 rarities
  const slot = FORGE_CORE_SLOTS[Math.floor(offset / 6)];
  const rarity = FORGE_RARITIES[offset % 6];
  return slot && rarity ? [`${BRAND}/forge/core_${slot}_${rarity}.svg`] : [];
};
export const installationImageCandidates = (id: string | number) => [
  `${BRAND}/installations/${id}.gif`,
  `${BRAND}/installations/${id}.png`,
];
export const tileImageCandidates = (id: string | number) => [
  `${BRAND}/tiles/${id}.png`,
  `${BRAND}/tiles/${id}.svg`,
];
// Parcels are rendered map snapshots hosted per tokenId on the Gotchiverse S3.
export const parcelImageCandidates = (id: string | number) => [
  `https://gotchiverse.s3.ap-northeast-1.amazonaws.com/${id}.png`,
];

/**
 * <img> that cycles through candidate URLs on error and renders nothing if all
 * fail (so a missing asset shows the container background, not a broken icon).
 */
export function AssetImage({ candidates, alt, className }: { candidates: string[]; alt: string; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [candidates.join("|")]);
  if (i >= candidates.length) return null;
  return (
    <img
      src={candidates[i]}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setI((n) => n + 1)}
    />
  );
}
