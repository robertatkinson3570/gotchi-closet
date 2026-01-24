export function formatTraitValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getRarityTier(rarityScore: number): string {
  if (rarityScore >= 530) return "Godlike";
  if (rarityScore >= 450) return "Mythical";
  if (rarityScore >= 350) return "Legendary";
  if (rarityScore >= 300) return "Rare";
  if (rarityScore >= 250) return "Uncommon";
  return "Common";
}

