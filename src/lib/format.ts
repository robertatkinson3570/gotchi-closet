export function formatTraitValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

