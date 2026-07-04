import { useQuery } from "@tanstack/react-query";
import { Aperture, Loader2 } from "lucide-react";
import { CORE_SUBGRAPH, PORTAL_SVGS_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";

const TRAITS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

// Confirmed Base Haunt-2 collateral aToken addresses → display symbol (verified
// against the live dapp open-portal view 2026-07-04). Unknown collaterals (e.g.
// some Haunt-1 sets) simply render without a symbol rather than a wrong label.
const COLLATERAL_SYMBOL: Record<string, string> = {
  "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390": "ETH",
  "0x1a13f4ca1d028320a707d99520abfefca3998b7f": "USDC",
  "0x60d55f02a771d515e077c9c2403a1ef324885cec": "USDT",
  "0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360": "AAVE",
  "0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4": "MATIC",
  "0x27f8d03b3a2196956ed754badc28d73be8830a6e": "DAI",
};

type Option = { index: number; collateral: string; traits: number[]; brs: number; svg: string };

// The 10 summonable Aavegotchis inside an opened portal. Options (traits +
// collateral + rarity) come from the core subgraph; the rendered SVGs come from
// the dedicated portal-svgs subgraph — the same two sources the dapp uses. They
// are paired by option index (parsed from the "<portalId>-<n>" id), not array
// position, so ordering differences between the two indexers can't misalign art.
async function fetchPortalOptions(tokenId: string): Promise<Option[]> {
  const [optRes, svgRes] = await Promise.all([
    coreSubgraphFetch(CORE_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ portal(id: "${tokenId}"){ options { id collateralType numericTraits baseRarityScore } } }` }),
    }),
    fetch(PORTAL_SVGS_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ portal(id: "${tokenId}"){ svgs } }` }),
    }),
  ]);
  const optJson = await optRes.json();
  const svgJson = await svgRes.json();
  const svgs: string[] = svgJson.data?.portal?.svgs ?? [];
  return (optJson.data?.portal?.options ?? [])
    .map((o: any) => {
      const index = Number(String(o.id).split("-")[1] ?? 0);
      return {
        index,
        collateral: String(o.collateralType ?? "").toLowerCase(),
        traits: (o.numericTraits ?? []).map(Number),
        brs: Number(o.baseRarityScore) || 0,
        svg: svgs[index] ?? "",
      };
    })
    .sort((a: Option, b: Option) => a.index - b.index);
}

export function PortalOptionsGrid({ tokenId }: { tokenId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-options-grid", tokenId],
    queryFn: () => fetchPortalOptions(tokenId),
    staleTime: 30 * 60_000, // an opened portal's 10 options are fixed until claimed
  });

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!data || data.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Aavegotchis in this portal</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.map((o) => (
          <div key={o.index} className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
            {/* Each gotchi SVG carries an inline <style> with SHARED class names
                (.gotchi-primary, .gotchi-eyeColor, …) but per-gotchi colors.
                Rendering them inline (innerHTML) makes those rules global and the
                last one wins — every gotchi bleeds to one palette. An <img> renders
                each SVG in its own context, so styles stay scoped (and can't run
                scripts). Same reason ExplorerGrid renders gotchis via <img>. */}
            {o.svg ? (
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(o.svg)}`}
                alt={`Summon option ${o.index + 1}`}
                loading="lazy"
                className="block aspect-square w-full rounded bg-muted/30 object-contain"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded bg-muted/30"><Aperture className="w-6 h-6 text-fuchsia-400/60" /></div>
            )}
            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold">
              <span>BRS {o.brs}</span>
              {COLLATERAL_SYMBOL[o.collateral] && <span className="px-1 rounded bg-muted/60 text-muted-foreground font-normal">{COLLATERAL_SYMBOL[o.collateral]}</span>}
            </div>
            <div className="text-[8px] text-muted-foreground leading-tight">{o.traits.slice(0, 6).map((t, j) => `${TRAITS[j]} ${t}`).join(" · ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
