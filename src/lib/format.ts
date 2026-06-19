export function formatTraitValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Short "0x1234…abcd" address, or "—" for an empty / zero address. */
export function shortAddress(a?: string): string {
  return a && a !== ZERO_ADDRESS ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

