import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { INSTALLATION_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";

import { GOTCHIVERSE_SUBGRAPH } from "@/lib/subgraph";

export type InventoryItem = {
  installationId: string;
  name: string;
  w: number;
  h: number;
  category: number; // installationType
  alch: number; // alchemicaType (-1 none)
  level: number;
  balance: number; // how many the wallet owns (unequipped)
};

async function fetchTypes(ids: string[]): Promise<Record<string, any>> {
  if (ids.length === 0) return {};
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($ids:[ID!]){ installationTypes(first:1000, where:{id_in:$ids}){ id name width height installationType alchemicaType level } }`,
      variables: { ids },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  const map: Record<string, any> = {};
  for (const t of json.data?.installationTypes ?? []) map[t.id] = t;
  return map;
}

/**
 * The wallet's owned (unequipped) installations, enriched with type metadata
 * (name, footprint, category, alchemica, level) for the build inventory tray.
 */
export function useInstallationInventory(owner?: string) {
  const { data: bals, isLoading: balLoading } = useReadContract({
    address: INSTALLATION_DIAMOND_BASE,
    abi: REALM_FACET_ABI,
    functionName: "installationsBalances",
    args: owner ? [owner as `0x${string}`] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!owner },
  });

  const owned = useMemo(() => {
    const list = (bals as ReadonlyArray<{ installationId: bigint; balance: bigint }> | undefined) ?? [];
    return list
      .filter((b) => b.balance > 0n)
      .map((b) => ({ id: b.installationId.toString(), balance: Number(b.balance) }));
  }, [bals]);

  const ids = useMemo(() => owned.map((o) => o.id), [owned]);

  const { data: types, isLoading: typeLoading } = useQuery({
    queryKey: ["installation-types", ids],
    queryFn: () => fetchTypes(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  const items = useMemo<InventoryItem[]>(() => {
    if (!types) return [];
    return owned
      .map((o) => {
        const t = types[o.id];
        if (!t) return null;
        return {
          installationId: o.id,
          name: t.name,
          w: Number(t.width) || 1,
          h: Number(t.height) || 1,
          category: t.installationType != null ? Number(t.installationType) : -1,
          alch: t.alchemicaType != null ? Number(t.alchemicaType) : -1,
          level: Number(t.level) || 1,
          balance: o.balance,
        } as InventoryItem;
      })
      .filter(Boolean) as InventoryItem[];
  }, [owned, types]);

  return { items, isLoading: balLoading || typeLoading };
}
