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

/** Compact relative time for unix-seconds timestamps: "5m ago", "3h ago", "2d ago".
 *  Pass nowMs explicitly in tests for determinism. */
export function timeAgo(unixSeconds: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "—";
  const s = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

