import { useQuery } from "@tanstack/react-query";

// The svg subgraph stores each gotchi's fully-rendered SVG by token id — used
// where we have a gotchi id but not its traits (e.g. auction listings).
const SVG_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-svg-base/prod/gn";

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
    queryKey: ["gotchi-svg-base", id],
    queryFn: () => fetchGotchiSvg(id),
    staleTime: 10 * 60_000,
  });
  if (!data) return null;
  return <span className={className} dangerouslySetInnerHTML={{ __html: data }} />;
}
