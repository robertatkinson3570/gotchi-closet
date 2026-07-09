import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { GOTCHIVERSE_SUBGRAPH } from "@/lib/subgraph";

// Parcel size codes used by the realm contract / gotchiverse subgraph.
const PARCEL_SIZE_LABEL: Record<number, string> = { 0: "Humble", 1: "Reasonable", 2: "Spacious (V)", 3: "Spacious (H)", 4: "Partner", 5: "Guardian" };

const ALCH = [
  { key: "FUD", cls: "text-emerald-400" },
  { key: "FOMO", cls: "text-orange-400" },
  { key: "ALPHA", cls: "text-sky-400" },
  { key: "KEK", cls: "text-purple-400" },
];

type ParcelInfo = {
  name: string; district: number; size: number; x: number; y: number;
  installations: number; tiles: number; surveyRound: number; aaltarLevel: number;
  boosts: number[]; remaining: number[]; claimed: number[];
};

async function fetchParcelInfo(tokenId: string): Promise<ParcelInfo | null> {
  const q = `{ parcel(id:"${tokenId}"){ parcelHash district size coordinateX coordinateY surveyRound equippedInstallationsBalance equippedTilesBalance equippedInstallations{ name level } fudBoost fomoBoost alphaBoost kekBoost remainingAlchemica totalAlchemicaClaimed } }`;
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const json = await res.json();
  const p = json.data?.parcel;
  if (!p) return null;
  const aaltar = (p.equippedInstallations ?? []).find((i: any) => (i.name ?? "").toLowerCase().includes("aaltar"));
  const toNum = (arr: unknown[]) => (Array.isArray(arr) ? arr.map((v) => Number(v) / 1e18) : [0, 0, 0, 0]);
  return {
    name: (p.parcelHash || "").replace(/-/g, " "),
    district: Number(p.district) || 0,
    size: Number(p.size) || 0,
    x: Number(p.coordinateX) || 0,
    y: Number(p.coordinateY) || 0,
    installations: Number(p.equippedInstallationsBalance) || 0,
    tiles: Number(p.equippedTilesBalance) || 0,
    surveyRound: Number(p.surveyRound) || 0,
    aaltarLevel: aaltar ? Number(aaltar.level) || 0 : 0,
    boosts: [Number(p.fudBoost) || 0, Number(p.fomoBoost) || 0, Number(p.alphaBoost) || 0, Number(p.kekBoost) || 0],
    remaining: toNum(p.remainingAlchemica),
    claimed: toNum(p.totalAlchemicaClaimed),
  };
}

const fmtAlch = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

function AlchemicaRow({ label, values, title }: { label: string; values: number[]; title: string }) {
  return (
    <div title={title}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {ALCH.map((t, i) => (
          <div key={t.key} className="rounded bg-muted/30 px-1.5 py-1 text-center">
            <div className={`text-[9px] font-semibold ${t.cls}`}>{t.key}</div>
            <div className="text-[10px] font-semibold tabular-nums truncate" title={fmtAlch(values[i] ?? 0)}>{fmtAlch(values[i] ?? 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dapp-parity parcel facts: identity, build state and the three alchemica
 *  ledgers (boost / survey remaining / claimed). Shared by the auction modal
 *  and the Baazaar parcel listing modal. */
export function ParcelDetailsPanel({ tokenId, showName = true }: { tokenId: string; showName?: boolean }) {
  const { data: p, isLoading } = useQuery({ queryKey: ["auction-parcel", tokenId], staleTime: 5 * 60_000, queryFn: () => fetchParcelInfo(tokenId) });
  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>;
  if (!p) return null;
  const stats: { label: string; value: string }[] = [
    { label: "District", value: String(p.district) },
    { label: "Size", value: PARCEL_SIZE_LABEL[p.size] ?? "?" },
    { label: "Coordinates", value: `${p.x}, ${p.y}` },
    { label: "Installations", value: String(p.installations) },
    { label: "Tiles", value: String(p.tiles) },
    { label: "Survey round", value: String(p.surveyRound) },
    { label: "Aaltar level", value: String(p.aaltarLevel) },
  ];
  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      {showName && (
        <div className="text-sm font-semibold capitalize">{p.name || `Parcel #${tokenId}`} <span className="font-mono text-xs text-muted-foreground">#{tokenId}</span></div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded bg-muted/30 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="text-xs font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <AlchemicaRow label="Alchemica boost" values={p.boosts} title="Permanent alchemica yield boosts on this parcel" />
      <AlchemicaRow label="Alchemica remaining" values={p.remaining} title="Surveyed alchemica still in the ground" />
      <AlchemicaRow label="Alchemica claimed" values={p.claimed} title="Total alchemica ever harvested from this parcel" />
    </div>
  );
}
