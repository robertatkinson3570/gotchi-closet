import { useEffect, useState } from "react";

// Aavegotchi brand asset CDN (verified against the live dapp's marketplace).
const BRAND = "https://dapp.aavegotchi.com/brand";

export const itemImageCandidates = (id: string | number) => [`${BRAND}/items/${id}.svg`];
export const installationImageCandidates = (id: string | number) => [
  `${BRAND}/installations/${id}.gif`,
  `${BRAND}/installations/${id}.png`,
];
export const tileImageCandidates = (id: string | number) => [
  `${BRAND}/tiles/${id}.png`,
  `${BRAND}/tiles/${id}.svg`,
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
