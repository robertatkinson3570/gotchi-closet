// Lightweight CSV export — no dep needed.
// Quotes only when value contains comma, quote, or newline.
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: any[][]): string {
  const out = [headers.map(csvCell).join(",")];
  for (const r of rows) out.push(r.map(csvCell).join(","));
  return out.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

// ----- Domain-specific exporters -----

import type { Lending } from "./types";
import type { HistoricalLending } from "@/hooks/useHistoricalLendings";
import { ghstFromWei } from "./transform";
import { brsBandOf, durationBucketOf } from "./types";

const ACTIVE_HEADERS = [
  "id",
  "gotchiTokenId",
  "name",
  "modBRS",
  "band",
  "periodSec",
  "periodDays",
  "periodBucket",
  "upfrontGhst",
  "splitBorrower",
  "splitOwner",
  "splitOther",
  "channellingAllowed",
  "whitelistId",
  "whitelistName",
  "lender",
  "originalOwner",
  "timeCreatedISO",
];

export function activeLendingsToCsv(lendings: Lending[]): string {
  const rows = lendings.map((l) => [
    l.id,
    l.gotchiTokenId,
    l.gotchi?.name ?? "",
    l.gotchi?.modifiedRarityScore ?? l.gotchiBRS,
    brsBandOf(l.gotchiBRS),
    l.period,
    Math.round((l.period / 86400) * 100) / 100,
    durationBucketOf(l.period),
    ghstFromWei(l.upfrontCost),
    l.splitBorrower,
    l.splitOwner,
    l.splitOther,
    l.channellingAllowed,
    l.whitelistId ?? "0",
    l.whitelistName ?? "",
    l.lender,
    l.originalOwner,
    l.timeCreated ? new Date(l.timeCreated * 1000).toISOString() : "",
  ]);
  return rowsToCsv(ACTIVE_HEADERS, rows);
}

const HISTORICAL_HEADERS = [
  "id",
  "gotchiTokenId",
  "name",
  "modBRS",
  "band",
  "periodDays",
  "periodBucket",
  "upfrontGhst",
  "splitBorrower",
  "splitOwner",
  "splitOther",
  "channellingAllowed",
  "whitelistId",
  "whitelistName",
  "lender",
  "borrower",
  "cancelled",
  "completed",
  "timeAgreedISO",
  "timeCreatedISO",
  "timeEndedISO",
];

export function historicalLendingsToCsv(lendings: HistoricalLending[]): string {
  const rows = lendings.map((l) => [
    l.id,
    l.gotchiTokenId,
    l.gotchiName ?? "",
    l.gotchi?.modifiedRarityScore ?? l.gotchiBRS,
    brsBandOf(l.gotchiBRS),
    Math.round((l.period / 86400) * 100) / 100,
    durationBucketOf(l.period),
    l.upfrontGhst,
    l.splitBorrower,
    l.splitOwner,
    l.splitOther,
    l.channellingAllowed,
    l.whitelistId ?? "0",
    l.whitelistName ?? "",
    l.lender,
    l.borrower ?? "",
    l.cancelled,
    l.completed,
    l.timeAgreed ? new Date(l.timeAgreed * 1000).toISOString() : "",
    l.timeCreated ? new Date(l.timeCreated * 1000).toISOString() : "",
    l.timeEnded ? new Date(l.timeEnded * 1000).toISOString() : "",
  ]);
  return rowsToCsv(HISTORICAL_HEADERS, rows);
}
