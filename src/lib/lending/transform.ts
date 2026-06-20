import type { Lending } from "./types";
import { parseEther } from "viem";

const NAKED_WEARABLES_LEN = 16;
const NUMERIC_TRAITS_LEN = 6;

function normalizeArray(value: unknown, length: number): number[] {
  const arr = Array.isArray(value) ? value : [];
  const result = new Array(length).fill(0);
  for (let i = 0; i < Math.min(length, arr.length); i++) {
    result[i] = Number(arr[i]) || 0;
  }
  return result;
}

export function transformLending(raw: any): Lending {
  const g = raw.gotchi;
  return {
    id: raw.id,
    gotchiTokenId: String(raw.gotchiTokenId ?? ""),
    gotchiBRS: Number(raw.gotchiBRS ?? 0),
    period: Number(raw.period ?? 0),
    upfrontCost: String(raw.upfrontCost ?? "0"),
    splitOwner: Number(raw.splitOwner ?? 0),
    splitBorrower: Number(raw.splitBorrower ?? 0),
    splitOther: Number(raw.splitOther ?? 0),
    whitelistId: raw.whitelistId != null ? String(raw.whitelistId) : null,
    whitelistName: raw.whitelist?.name ?? null,
    thirdPartyAddress: raw.thirdPartyAddress ?? null,
    lender: String(raw.lender ?? ""),
    originalOwner: String(raw.originalOwner ?? ""),
    channellingAllowed: Boolean(raw.channellingAllowed),
    timeCreated: Number(raw.timeCreated ?? 0),
    gotchi: g
      ? {
          id: g.id,
          name: g.name ?? null,
          hauntId: Number(g.hauntId ?? 1),
          level: Number(g.level ?? 1),
          baseRarityScore: Number(g.baseRarityScore ?? 0),
          modifiedRarityScore: Number(g.modifiedRarityScore ?? 0),
          withSetsRarityScore: Number(g.withSetsRarityScore ?? 0),
          kinship: Number(g.kinship ?? 0),
          collateral: String(g.collateral ?? ""),
          numericTraits: normalizeArray(g.numericTraits, NUMERIC_TRAITS_LEN),
          modifiedNumericTraits: normalizeArray(g.modifiedNumericTraits, NUMERIC_TRAITS_LEN),
          withSetsNumericTraits: normalizeArray(g.withSetsNumericTraits, NUMERIC_TRAITS_LEN),
          equippedWearables: normalizeArray(g.equippedWearables, NAKED_WEARABLES_LEN),
        }
      : null,
  };
}

export function ghstFromWei(wei: string): number {
  if (!wei || wei === "0") return 0;
  try {
    return Number(BigInt(wei)) / 1e18;
  } catch {
    return 0;
  }
}

/**
 * Convert a GHST amount (decimal string or number) to wei (1e18) as a bigint.
 * Never throws: empty / non-positive / malformed input -> 0n (matching the
 * silent behaviour of the hand-rolled converters this replaces). Inputs with
 * more than 18 decimal places are truncated, as parseEther would otherwise throw.
 * Uses String(value) rather than toFixed so exact decimals (e.g. 0.1) are kept.
 */
export function ghstToWei(value: string | number): bigint {
  const s = (typeof value === "number" ? String(value) : value ?? "").trim();
  if (!s) return BigInt(0);
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return BigInt(0);
  try {
    const [whole, frac = ""] = s.split(".");
    const clamped = frac.length > 18 ? `${whole}.${frac.slice(0, 18)}` : s;
    return parseEther(clamped);
  } catch {
    return BigInt(0);
  }
}

export function formatGhst(wei: string): string {
  const n = ghstFromWei(wei);
  if (n === 0) return "0";
  if (n < 1) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

export function formatPeriod(seconds: number): string {
  const days = seconds / 86400;
  if (days < 1) {
    const hours = Math.round(seconds / 3600);
    return `${hours}h`;
  }
  const d = Math.round(days * 10) / 10;
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}

export function formatGhstPerDay(wei: string, periodSec: number): string {
  if (!periodSec) return "—";
  const ghst = ghstFromWei(wei);
  const days = periodSec / 86400;
  if (!days) return "—";
  const perDay = ghst / days;
  if (perDay < 1) return `${perDay.toFixed(2)}/d`;
  if (perDay < 100) return `${perDay.toFixed(1)}/d`;
  return `${Math.round(perDay)}/d`;
}
