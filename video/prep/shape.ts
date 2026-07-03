// Pure data-shaping helpers for prep scripts. No I/O in this file.

export type SeriesPoint = { day: string; value: number };

export function equipOrder(equipped: number[]): { slot: number; id: number }[] {
  return equipped.map((id, slot) => ({ slot, id })).filter((e) => e.id > 0);
}

export function cumulativeSlotArrays(order: { slot: number; id: number }[]): number[][] {
  const out: number[][] = [];
  const current = new Array<number>(16).fill(0);
  for (const { slot, id } of order) {
    current[slot] = id;
    out.push([...current]);
  }
  return out;
}

export function sumLastDays(series: SeriesPoint[] | undefined, days: number): number {
  if (!series || series.length === 0) return 0;
  return series.slice(-days).reduce((s, p) => s + p.value, 0);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function weekLabel(endMs: number): string {
  const end = new Date(endMs);
  const start = new Date(endMs - 6 * 86_400_000);
  const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ghstFromWei(wei: string): number {
  return Number(BigInt(wei) / 10n ** 14n) / 10_000;
}

// Base mainnet ~2s blocks
export function blocksToDays(blocks: number): number {
  return Math.round((blocks * 2) / 86_400);
}
