import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, Tag, Gavel, TrendingUp } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { CORE_SUBGRAPH_URL } from "@/lib/lending/contracts";
import { GBM_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { useGhstUsd } from "@/hooks/useGhstUsd";

type Win = { key: string; label: string; seconds: number };
const WINDOWS: Win[] = [
  { key: "24H", label: "24H", seconds: 86400 },
  { key: "7D", label: "7D", seconds: 7 * 86400 },
  { key: "30D", label: "30D", seconds: 30 * 86400 },
  { key: "3M", label: "3M", seconds: 90 * 86400 },
];

// Encode label as an index so the page-summer's pick stays cheap; decode via LABELS.
const LABELS = ["Other", "Gotchis", "Parcels", "FAKE Gotchis", "Closed Portals", "Open Portals", "Wearables", "Consumables", "Installations", "Tiles", "FAKE Cards", "Guardian Skins", "Forge Items"];
const LABEL_INDEX: Record<string, number> = Object.fromEntries(LABELS.map((l, i) => [l, i]));

// Kind-aware category labels (BAAZAAR_CATEGORY collides values across erc721/erc1155).
function catLabel(kind: "erc721" | "erc1155", c: number): string {
  if (kind === "erc721") return c === 3 ? "Gotchis" : c === 4 ? "Parcels" : c === 5 ? "FAKE Gotchis" : c === 0 ? "Closed Portals" : c === 2 ? "Open Portals" : "Other";
  return c === 0 ? "Wearables" : c === 2 ? "Consumables" : c === 4 ? "Installations" : c === 5 ? "Tiles" : c === 6 ? "FAKE Cards" : c === 12 ? "Guardian Skins" : c >= 7 && c <= 11 ? "Forge Items" : "Other";
}
function catLabelNum(kind: "erc721" | "erc1155", c: number): number {
  return LABEL_INDEX[catLabel(kind, c)] ?? 0;
}

async function gql(url: string, query: string) {
  const res = await coreSubgraphFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

// Page through a settled feed within [start, now], returning per-row {wei,cat,t}.
async function pageSum(url: string, build: (cursor: number) => string, pick: (row: any) => { wei: number; cat: number; t: number }) {
  let cursor = 0;
  let rows: any[] = [];
  for (let i = 0; i < 8; i++) {
    const d = await gql(url, build(cursor));
    const batch: any[] = d[Object.keys(d)[0]] ?? [];
    rows = rows.concat(batch);
    if (batch.length < 1000) break;
    cursor = pick(batch[batch.length - 1]).t;
  }
  return rows.map(pick);
}

type Bucket = { volume: number; count: number; byCat: Record<string, number> };
type Stats = { baazaar: Bucket; auctions: Bucket; allTime: { erc721: number; erc1155: number } };

async function fetchStats(start: number): Promise<Stats> {
  const now = Math.floor(Date.now() / 1000);
  const [e721, e1155, auctions, allTimeData] = await Promise.all([
    pageSum(
      CORE_SUBGRAPH_URL,
      (c) => `{ erc721Listings(first:1000, where:{ timePurchased_gt:"${Math.max(start, c)}" }, orderBy:timePurchased, orderDirection:asc){ priceInWei category timePurchased } }`,
      (r) => ({ wei: Number(r.priceInWei) / 1e18, cat: catLabelNum("erc721", Number(r.category)), t: Number(r.timePurchased) })
    ),
    pageSum(
      CORE_SUBGRAPH_URL,
      (c) => `{ erc1155Listings(first:1000, where:{ sold:true, timeLastPurchased_gt:"${Math.max(start, c)}" }, orderBy:timeLastPurchased, orderDirection:asc){ priceInWei category timeLastPurchased } }`,
      (r) => ({ wei: Number(r.priceInWei) / 1e18, cat: catLabelNum("erc1155", Number(r.category)), t: Number(r.timeLastPurchased) })
    ),
    pageSum(
      GBM_SUBGRAPH,
      (c) => `{ auctions(first:1000, where:{ endsAt_gt:"${Math.max(start, c)}", endsAt_lt:"${now}", cancelled:false, highestBid_gt:"0" }, orderBy:endsAt, orderDirection:asc){ highestBid category endsAt type } }`,
      (r) => ({ wei: Number(r.highestBid) / 1e18, cat: r.type === "erc1155" ? catLabelNum("erc1155", Number(r.category)) : catLabelNum("erc721", Number(r.category)), t: Number(r.endsAt) })
    ),
    gql(CORE_SUBGRAPH_URL, `{ statistics(first:1){ erc721TotalVolume erc1155TotalVolume } }`),
  ]);

  const bucket = (rows: { wei: number; cat: number }[]): Bucket => {
    const b: Bucket = { volume: 0, count: 0, byCat: {} };
    for (const r of rows) {
      if (!(r.wei > 0)) continue;
      b.volume += r.wei;
      b.count += 1;
      const label = LABELS[r.cat] ?? "Other";
      b.byCat[label] = (b.byCat[label] || 0) + r.wei;
    }
    return b;
  };

  const st = allTimeData?.statistics?.[0];
  return {
    baazaar: bucket([...e721, ...e1155]),
    auctions: bucket(auctions),
    allTime: {
      erc721: st ? Number(st.erc721TotalVolume) / 1e18 : 0,
      erc1155: st ? Number(st.erc1155TotalVolume) / 1e18 : 0,
    },
  };
}

const fmtGhst = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmtUsd = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

function VolumeCard({ title, icon: Icon, bucket, ghstUsd, accent }: { title: string; icon: typeof Tag; bucket: Bucket; ghstUsd: number; accent: string }) {
  const cats = Object.entries(bucket.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = cats[0]?.[1] || 1;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-5 ring-1 ring-primary/5">
      <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl ${accent}`} />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="w-4 h-4" /> {title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{fmtGhst(bucket.volume)}</span>
          <span className="text-sm text-muted-foreground">GHST</span>
        </div>
        <div className="text-sm text-emerald-500 font-medium">{ghstUsd > 0 ? `≈ ${fmtUsd(bucket.volume * ghstUsd)}` : ""}</div>
        <div className="text-xs text-muted-foreground mt-1">{bucket.count.toLocaleString()} settled sale{bucket.count === 1 ? "" : "s"}</div>
        {cats.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {cats.map(([label, vol]) => (
              <div key={label}>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{label}</span><span>{fmtGhst(vol)}</span></div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${Math.max(4, (vol / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [win, setWin] = useState<Win>(WINDOWS[1]);
  const start = useMemo(() => Math.floor(Date.now() / 1000) - win.seconds, [win]);
  const { data, isLoading, error } = useQuery({ queryKey: ["stats", win.key], queryFn: () => fetchStats(start), staleTime: 60_000 });
  const { data: ghstUsd = 0 } = useGhstUsd();

  return (
    <div className="container mx-auto max-w-[1000px] px-4 py-6">
      <Seo title="Marketplace Stats · GotchiCloset" description="Settled Baazaar and auction volume across the Aavegotchi marketplace on Base." canonical={siteUrl("/stats")} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Marketplace Stats</h1>
        <div className="flex items-center gap-1.5 text-xs">
          <Link to="/activity" className="h-8 px-3 inline-flex items-center rounded-lg border border-border/40 text-muted-foreground hover:bg-muted/40">Activity</Link>
          <span className="h-8 px-3 inline-flex items-center rounded-lg bg-primary/15 text-primary border border-primary/40 font-semibold">Stats</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-5">
        <span className="text-xs text-muted-foreground mr-1">Chain: <span className="font-semibold text-foreground">Base</span> ·</span>
        {WINDOWS.map((w) => (
          <button key={w.key} onClick={() => setWin(w)} className={`h-8 px-3.5 rounded-lg text-xs font-semibold border ${win.key === w.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{w.label}</button>
        ))}
      </div>

      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VolumeCard title="Baazaar volume" icon={Tag} bucket={data.baazaar} ghstUsd={ghstUsd} accent="bg-primary/20" />
            <VolumeCard title="Auctions volume" icon={Gavel} bucket={data.auctions} ghstUsd={ghstUsd} accent="bg-emerald-500/20" />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-muted/10 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3"><TrendingUp className="w-4 h-4" /> All-time settled volume (on-chain)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><div className="text-2xl font-bold">{fmtGhst(data.allTime.erc721)}</div><div className="text-xs text-muted-foreground">GHST · ERC721 (gotchis/parcels/portals/FAKE)</div></div>
              <div><div className="text-2xl font-bold">{fmtGhst(data.allTime.erc1155)}</div><div className="text-xs text-muted-foreground">GHST · ERC1155 (wearables/items/installations)</div></div>
              <div><div className="text-2xl font-bold">{fmtGhst(data.allTime.erc721 + data.allTime.erc1155)}</div><div className="text-xs text-muted-foreground">GHST · total Baazaar</div></div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground text-center">Windowed figures sum settled Baazaar listings and GBM auctions on Base. USD via GHST spot.</p>
        </>
      )}
    </div>
  );
}
