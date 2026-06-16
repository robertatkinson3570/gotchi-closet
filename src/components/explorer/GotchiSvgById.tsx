import type { ReactNode } from "react";
import { qk } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

// The svg subgraph stores each gotchi's fully-rendered SVG by token id — used
// where we have a gotchi id but not its traits (e.g. auction listings).
import { SVG_SUBGRAPH as SVG_SUBGRAPH_URL, CORE_SUBGRAPH } from "@/lib/subgraph";

async function fetchGotchiSvg(id: string): Promise<string | null> {
  const res = await fetch(SVG_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query($id:ID!){ aavegotchi(id:$id){ svg } }`, variables: { id } }),
  });
  const json = await res.json();
  return json.data?.aavegotchi?.svg ?? null;
}

export function GotchiSvgById({ id, className }: { id: string; className?: string }) {
  const { data } = useQuery({
    queryKey: qk.gotchiSvg(id),
    queryFn: () => fetchGotchiSvg(id),
    staleTime: 10 * 60_000,
  });
  if (!data) return null;
  return <span className={className} dangerouslySetInnerHTML={{ __html: data }} />;
}

// Fake Gotchis are a separate collection; their art is off-chain (irys) and
// resolved via the dapp's image proxy using the metadata hash from the core
// subgraph's fakeGotchiNFTTokens entity.
async function fetchFakeGotchiImage(id: string): Promise<string | null> {
  const res = await fetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($id:String!){ fakeGotchiNFTTokens(first:1, where:{ identifier:$id }){ metadata { thumbnailHash fileHash } } }`,
      variables: { id },
    }),
  });
  const json = await res.json();
  const m = json.data?.fakeGotchiNFTTokens?.[0]?.metadata;
  const hash = m?.thumbnailHash || m?.fileHash;
  return hash ? `https://dapp.aavegotchi.com/api/image/proxy?hash=${hash}&width=400&height=400` : null;
}

export function FakeGotchiImage({ id, className, fallback }: { id: string; className?: string; fallback?: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.fakeGotchiImg(id),
    queryFn: () => fetchFakeGotchiImage(id),
    staleTime: 10 * 60_000,
  });
  if (data) return <img src={data} alt={`#${id}`} loading="lazy" className={className} />;
  if (isLoading) return null;
  return <>{fallback ?? null}</>;
}
