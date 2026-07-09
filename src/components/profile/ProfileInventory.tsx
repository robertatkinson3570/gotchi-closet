import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Ghost, Shirt, MapPin, DoorOpen } from "lucide-react";
import { CORE_SUBGRAPH, GOTCHIVERSE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { fetchOwnedWearableBalances } from "@/lib/explorer/wearableHolders";
import { itemMetaSync, RARITY_COLORS } from "@/lib/explorer/itemMeta";
import { AssetImage, itemImageCandidates, parcelImageCandidates } from "@/components/explorer/AssetImage";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { Wearable3DThumb } from "@/components/viewer3d/Wearable3DThumb";
import { Gotchi3D } from "@/components/viewer3d/Gotchi3D";
import { toSlug } from "@/lib/slug";

type OwnedGotchi = { id: string; name: string; brs: number; kin: number; lvl: number; haunt: number; collateral: string; numericTraits: number[]; equippedWearables: number[] };
type OwnedParcel = { id: string; name: string; district: string; size: string };
type OwnedPortal = { id: string; hauntId: string; status: string };

const PARCEL_SIZES: Record<string, string> = { "0": "Humble", "1": "Reasonable", "2": "Spacious (V)", "3": "Spacious (H)", "4": "Partner", "5": "Guardian" };

async function fetchInventory(addr: string): Promise<{ gotchis: OwnedGotchi[]; parcels: OwnedParcel[]; portals: OwnedPortal[] }> {
  const a = addr.toLowerCase();
  const coreQ = `{
    aavegotchis(first: 1000, where: { owner: "${a}" }, orderBy: withSetsRarityScore, orderDirection: desc) { id name withSetsRarityScore modifiedRarityScore kinship level hauntId collateral numericTraits equippedWearables }
    portals(first: 1000, where: { owner: "${a}" }) { id hauntId status }
  }`;
  const coreRes = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: coreQ }) });
  const core = (await coreRes.json()).data ?? {};
  const parcelsQ = `{ parcels(first: 1000, where: { owner: "${a}" }, orderBy: size, orderDirection: desc) { id parcelHash district size } }`;
  const pvRes = await fetch(GOTCHIVERSE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: parcelsQ }) });
  const pv = (await pvRes.json()).data ?? {};
  return {
    gotchis: (core.aavegotchis ?? []).map((g: any) => ({
      id: g.id,
      name: g.name || "Unnamed",
      brs: Number(g.withSetsRarityScore ?? g.modifiedRarityScore) || 0,
      kin: Number(g.kinship) || 0,
      lvl: Number(g.level) || 0,
      haunt: Number(g.hauntId) || 1,
      collateral: g.collateral || "",
      numericTraits: (g.numericTraits ?? []).map((n: any) => Number(n)),
      equippedWearables: (g.equippedWearables ?? []).map((n: any) => Number(n)),
    })),
    parcels: (pv.parcels ?? []).map((p: any) => ({ id: p.id, name: (p.parcelHash || "").replace(/-/g, " "), district: String(p.district ?? ""), size: String(p.size ?? "") })),
    portals: (core.portals ?? []).map((p: any) => ({ id: p.id, hauntId: String(p.hauntId ?? ""), status: String(p.status ?? "") })),
  };
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Ghost; title: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold pt-1">
      <Icon className="w-4 h-4 text-primary" /> {title} <span className="text-muted-foreground font-normal">({count})</span>
    </div>
  );
}

/** Dapp-parity profile inventory: what a wallet holds (gotchis, wearables,
 *  parcels, portals), viewable for any address, not just the connected one.
 *  Lent-out gotchis sit in the lending escrow on-chain, so they appear on the
 *  borrower side until the lending ends (same as the dapp). */
export function ProfileInventory({ address }: { address: string }) {
  const [showAllWearables, setShowAllWearables] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["profile-inventory", address.toLowerCase()],
    staleTime: 60_000,
    queryFn: () => fetchInventory(address),
  });
  const { data: wearableBalances } = useQuery({
    queryKey: ["profile-wearables", address.toLowerCase()],
    staleTime: 60_000,
    queryFn: () => fetchOwnedWearableBalances(address),
  });

  const wearables = useMemo(() => {
    const rows = [...(wearableBalances ?? new Map<number, number>())].map(([id, bal]) => ({ id, bal, meta: itemMetaSync(id) }));
    rows.sort((x, y) => (y.meta?.rarity ? 1 : 0) - (x.meta?.rarity ? 1 : 0) || y.bal - x.bal);
    return rows;
  }, [wearableBalances]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const gotchis = data?.gotchis ?? [];
  const parcels = data?.parcels ?? [];
  const portals = data?.portals ?? [];
  const wearableRows = showAllWearables ? wearables : wearables.slice(0, 24);

  if (gotchis.length === 0 && wearables.length === 0 && parcels.length === 0 && portals.length === 0)
    return <div className="text-center py-12 text-muted-foreground text-sm">This wallet holds no gotchis, wearables, parcels or portals on Base.</div>;

  return (
    <div className="space-y-4">
      {gotchis.length > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={Ghost} title="Gotchis" count={gotchis.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {gotchis.map((g) => (
              <Link key={g.id} to={`/gotchi/${g.id}`} className="rounded-xl border border-border/40 bg-background/60 p-2 space-y-1 hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 transition-all">
                <div className="h-20 rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                  <Gotchi3D
                    gotchi={{ collateral: g.collateral, hauntId: g.haunt, numericTraits: g.numericTraits, equippedWearables: g.equippedWearables, name: g.name, tokenId: g.id }}
                    className="w-full h-full"
                    posterOnly
                    fallback={<GotchiSvgById id={g.id} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" />}
                  />
                </div>
                <div className="text-[10px] font-semibold truncate" title={g.name}>{g.name} <span className="text-muted-foreground font-normal">#{g.id}</span></div>
                <div className="text-[9px] text-muted-foreground">RAR {g.brs} · KIN {g.kin} · L{g.lvl} · H{g.haunt}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {wearables.length > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={Shirt} title="Wearables" count={wearables.length} />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {wearableRows.map(({ id, bal, meta }) => (
              <Link
                key={id}
                to={meta ? `/wearable/${toSlug(meta.name)}` : "#"}
                className="rounded-xl border border-border/40 bg-background/60 p-2 space-y-1 hover:ring-1 hover:ring-primary/40 transition-all"
              >
                <div className="h-14 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                  <Wearable3DThumb
                    wearableId={id}
                    alt={meta?.name ?? `#${id}`}
                    fallback={<AssetImage candidates={itemImageCandidates(id)} alt={meta?.name ?? `#${id}`} className="max-h-12 max-w-12 object-contain" />}
                  />
                </div>
                <div className={`text-[9px] font-semibold truncate ${meta?.rarity ? RARITY_COLORS[meta.rarity] ?? "" : ""}`} title={meta?.name}>{meta?.name ?? `#${id}`}</div>
                <div className="text-[8px] text-muted-foreground">×{bal}{meta?.slot ? ` · ${meta.slot}` : ""}</div>
              </Link>
            ))}
          </div>
          {wearables.length > 24 && (
            <button onClick={() => setShowAllWearables((v) => !v)} className="text-[11px] text-primary hover:underline">
              {showAllWearables ? "Show fewer" : `Show all ${wearables.length}`}
            </button>
          )}
        </div>
      )}

      {parcels.length > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={MapPin} title="Parcels" count={parcels.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {parcels.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/40 bg-background/60 p-2 space-y-1">
                <div className="h-16 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                  <AssetImage candidates={parcelImageCandidates(p.id)} alt={`#${p.id}`} className="max-h-full max-w-full object-contain rounded" />
                </div>
                <div className="text-[10px] font-semibold capitalize truncate" title={p.name}>{p.name || `Parcel #${p.id}`}</div>
                <div className="text-[9px] text-muted-foreground">#{p.id} · Dist {p.district} · {PARCEL_SIZES[p.size] ?? "?"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {portals.length > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={DoorOpen} title="Portals" count={portals.length} />
          <div className="flex flex-wrap gap-1.5">
            {portals.map((p) => (
              <span key={p.id} className="text-[10px] px-2 py-1 rounded-md border border-border/40 bg-background/60">
                #{p.id} · H{p.hauntId} · {p.status === "Opened" ? "Open" : p.status || "Closed"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
