import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";

export type OnchainOutfit = { id: string; name: string; gotchiTokenId: string; wearables: number[] };
export type WardrobeEvent = {
  wearableId: number;
  slotPosition: number;
  equippedAt: number;
  unequippedAt: number | null;
  isCurrentlyEquipped: boolean;
  isDelegated: boolean;
};
export type Wearer = { gotchiId: string; equippedAt: number };

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

const OUTFITS_FOR_OWNER = `
  query OutfitsForOwner($owner: String!) {
    wearablesConfigs(first: 100, where: { ownerAddress: $owner }) {
      id
      name
      gotchiTokenId
      wearables
    }
  }
`;

/** On-chain saved outfits (WearablesConfig) for a wallet, across all its gotchis. */
export async function fetchOutfitsForOwner(owner: string): Promise<OnchainOutfit[]> {
  const data = await gql<{ wearablesConfigs: { id: string; name: string; gotchiTokenId: string; wearables: number[] }[] }>(
    OUTFITS_FOR_OWNER,
    { owner: owner.toLowerCase() }
  );
  return (data?.wearablesConfigs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    gotchiTokenId: c.gotchiTokenId,
    wearables: c.wearables,
  }));
}

const WARDROBE_HISTORY_FOR_GOTCHI = `
  query WardrobeHistoryForGotchi($id: String!) {
    equippedWearableOwners(first: 200, where: { gotchiId: $id }, orderBy: equippedAt, orderDirection: desc) {
      wearableId
      slotPosition
      equippedAt
      unequippedAt
      isCurrentlyEquipped
      isDelegated
    }
  }
`;

/** Full equip/unequip timeline for one gotchi (EquippedWearableOwner), newest first. */
export async function fetchWardrobeHistory(gotchiId: string): Promise<WardrobeEvent[]> {
  const data = await gql<{
    equippedWearableOwners: {
      wearableId: number;
      slotPosition: number;
      equippedAt: string;
      unequippedAt: string | null;
      isCurrentlyEquipped: boolean;
      isDelegated: boolean;
    }[];
  }>(WARDROBE_HISTORY_FOR_GOTCHI, { id: gotchiId });
  return (data?.equippedWearableOwners ?? []).map((e) => ({
    wearableId: e.wearableId,
    slotPosition: e.slotPosition,
    equippedAt: Number(e.equippedAt),
    unequippedAt: e.unequippedAt && Number(e.unequippedAt) !== 0 ? Number(e.unequippedAt) : null,
    isCurrentlyEquipped: e.isCurrentlyEquipped,
    isDelegated: e.isDelegated,
  }));
}

const CURRENT_WEARERS = `
  query CurrentWearers($wid: Int!) {
    equippedWearableOwners(first: 20, where: { wearableId: $wid, isCurrentlyEquipped: true }, orderBy: equippedAt, orderDirection: desc) {
      gotchiId
      equippedAt
    }
  }
`;

/** Gotchis currently wearing a given wearable id ("worn by" provenance). */
export async function fetchCurrentWearers(wearableId: number): Promise<Wearer[]> {
  const data = await gql<{ equippedWearableOwners: { gotchiId: string; equippedAt: string }[] }>(
    CURRENT_WEARERS,
    { wid: wearableId }
  );
  return (data?.equippedWearableOwners ?? []).map((e) => ({
    gotchiId: e.gotchiId,
    equippedAt: Number(e.equippedAt),
  }));
}
