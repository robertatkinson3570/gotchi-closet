import { useQuery } from "@tanstack/react-query";

const GOTCHIVERSE_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";

export type EquippedInstallation = {
  installationId: string;
  name: string;
  x: string;
  y: string;
};

async function fetchInstallations(parcelId: string): Promise<EquippedInstallation[]> {
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($p:String!){ installations(first:200, where:{parcel:$p, equipped:true}){ id x y type{ id name } } }`,
      variables: { p: parcelId },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return (json.data?.installations ?? []).map((i: any) => ({
    installationId: i.type.id,
    name: i.type.name,
    x: i.x,
    y: i.y,
  }));
}

/**
 * Equipped installations on a single parcel (id, grid coords, type name),
 * fetched lazily — only when a parcel row is expanded. Each row provides the
 * (installationId, x, y) needed to unequip it.
 */
export function useParcelInstallations(parcelId: string | null) {
  const query = useQuery({
    queryKey: ["parcel-installations", parcelId],
    queryFn: () => fetchInstallations(parcelId as string),
    enabled: !!parcelId,
    staleTime: 20_000,
  });
  return {
    installations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : undefined,
  };
}
