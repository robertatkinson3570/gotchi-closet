// server/steward/chain.ts
// Reads the owner's gotchi + parcel state into a ChainSnapshot for dueWork. Enumeration via
// the Goldsky subgraphs (same endpoints as src/lib/subgraph.ts); per-id reads via viem.
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND } from "./abi";
import type { ChainSnapshot } from "./dueWork";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const CORE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const VERSE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const realmAbi = [
  { name: "getAltarId", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getParcelLastChanneled", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getLastChanneled", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getAvailableAlchemica", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256[4]" }] },
  { name: "lastClaimedAlchemica", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
const gotchiAbi = [
  { name: "getAavegotchi", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ name: "lastInteracted", type: "uint256" }] }] },
] as const;

async function sg(url: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// altar installation id -> level (1-9 and 10-18 lines), mirrors src/lib/lending/contracts.ts
const altarLevel = (id: number) => (id <= 0 ? 0 : id <= 9 ? id : id - 9);

export async function snapshotFor(owner: string): Promise<ChainSnapshot> {
  const o = owner.toLowerCase();
  const [coreData, verseData] = await Promise.all([
    sg(CORE_SG, `query($o:Bytes!){ aavegotchis(first:200, where:{owner:$o, status:3}) { gotchiId } }`, { o }),
    sg(VERSE_SG, `query($o:Bytes!){ parcels(first:500, where:{owner:$o}) { tokenId } }`, { o }),
  ]);
  const gotchiIds: number[] = coreData.aavegotchis.map((a: any) => Number(a.gotchiId));
  const parcelIds: number[] = verseData.parcels.map((p: any) => Number(p.tokenId));

  const gotchis = await Promise.all(gotchiIds.map(async (id) => {
    const [info, lastChanneled] = await Promise.all([
      client.readContract({ address: AAVEGOTCHI_DIAMOND, abi: gotchiAbi, functionName: "getAavegotchi", args: [BigInt(id)] }) as Promise<any>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getLastChanneled", args: [BigInt(id)] }) as Promise<bigint>,
    ]);
    return { id, lastInteracted: Number(info.lastInteracted), lastChanneled: Number(lastChanneled) };
  }));

  const parcels = await Promise.all(parcelIds.map(async (id) => {
    const [altar, plc, lc, avail] = await Promise.all([
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getAltarId", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getParcelLastChanneled", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "lastClaimedAlchemica", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getAvailableAlchemica", args: [BigInt(id)] }) as Promise<readonly bigint[]>,
    ]);
    return { id, altarLevel: altarLevel(Number(altar)), lastChanneled: Number(plc), lastClaimed: Number(lc), claimable: [...avail] };
  }));

  return { gotchis, parcels };
}
