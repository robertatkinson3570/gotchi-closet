// server/steward/chain.ts
// Reads the owner's gotchi + parcel state into a ChainSnapshot for dueWork. Enumeration via
// the Goldsky subgraphs (same endpoints as src/lib/subgraph.ts); per-id reads via viem.
import { createPublicClient, http, fallback, BaseError, ExecutionRevertedError } from "viem";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND } from "./abi";
import type { ChainSnapshot } from "./dueWork";
import type { Call } from "./encode";

// A wallet with several parcels fires dozens of reservoir/channel eth_calls per snapshot. A single
// public RPC (mainnet.base.org) 429-rate-limits that burst and the whole upkeep read fails, so the
// "empty reservoirs" prepare+sign flow dies with "couldn't send". Fix: rotate across a pool of
// public Base RPCs (viem fallback advances on error) AND batch concurrent reads via multicall so
// the request count collapses. A keyed STEWARD_RPC_URL, when set, is preferred first.
const RPC_URLS = [
  process.env.STEWARD_RPC_URL,
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
].filter(Boolean) as string[];
const CORE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const VERSE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";
const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((url) => http(url, { retryCount: 2, retryDelay: 300 })), { retryCount: 1 }),
  batch: { multicall: { wait: 16 } },
});

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
  { name: "kinship", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

async function sg(url: string, query: string, variables: Record<string, unknown>) {
  // Hard timeout: a single hung subgraph socket must never wedge the cron loop (the awaits
  // in runAllDue are sequential, so one eternal fetch would stall every owner's steward).
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// altar installation id -> level (1-9 and 10-18 lines), mirrors src/lib/lending/contracts.ts
const altarLevel = (id: number) => (id <= 0 ? 0 : id <= 9 ? id : id - 9);

export async function snapshotFor(owner: string): Promise<ChainSnapshot> {
  const o = owner.toLowerCase();
  const [coreData, lentData, verseData] = await Promise.all([
    sg(CORE_SG, `query($o:Bytes!){ aavegotchis(first:200, where:{owner:$o, status:3}) { gotchiId } }`, { o }),
    // A lent-out gotchi's `owner` moves to the lending escrow, so it's missed by the query
    // above. Fetch the lender's lent-out ids from the user entity and fold them in — the owner
    // can still steward them (pet always; dueWork skips lent gotchis for channeling).
    sg(CORE_SG, `query($o:ID!){ user(id:$o){ gotchisLentOut } }`, { o }),
    sg(VERSE_SG, `query($o:Bytes!){ parcels(first:500, where:{owner:$o}) { tokenId } }`, { o }),
  ]);
  const ownedIds: number[] = coreData.aavegotchis.map((a: any) => Number(a.gotchiId));
  const lentIds: number[] = (lentData?.user?.gotchisLentOut ?? []).map((x: any) => Number(x));
  const lentSet = new Set<number>(lentIds);
  const gotchiIds: number[] = Array.from(new Set<number>([...ownedIds, ...lentIds]));
  const parcelIds: number[] = verseData.parcels.map((p: any) => Number(p.tokenId));

  const gotchis = await Promise.all(gotchiIds.map(async (id) => {
    const [info, lastChanneled, kin] = await Promise.all([
      client.readContract({ address: AAVEGOTCHI_DIAMOND, abi: gotchiAbi, functionName: "getAavegotchi", args: [BigInt(id)] }) as Promise<any>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getLastChanneled", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: AAVEGOTCHI_DIAMOND, abi: gotchiAbi, functionName: "kinship", args: [BigInt(id)] }) as Promise<bigint>,
    ]);
    return { id, lastInteracted: Number(info.lastInteracted), lastChanneled: Number(lastChanneled), lentOut: lentSet.has(id), kinship: Number(kin) };
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

// Pre-submit check: eth_call each action from the player's account and keep only the ones
// that don't revert (filters stale cooldowns, Not Altar, lent-gotchi channel, etc.) so the
// runner never submits a reverting userOp the player would pay for.
// Only genuine REVERTS are dropped. Infra errors (rate limit, network, RPC down) rethrow:
// swallowing them would record a "successful" empty run, advance lastRunAt, and silently
// skip the owner's due upkeep for a whole interval.
export async function simulateCalls(from: string, calls: Call[]): Promise<Call[]> {
  const out: Call[] = [];
  for (const c of calls) {
    try {
      await client.call({ account: from as `0x${string}`, to: c.to, data: c.data });
      out.push(c);
    } catch (err) {
      const msg = err instanceof BaseError ? `${err.shortMessage} ${err.details ?? ""}` : String((err as Error).message);
      const isRevert = (err instanceof BaseError && err.walk((e) => e instanceof ExecutionRevertedError) !== null) || /revert/i.test(msg);
      if (!isRevert) throw err;
      /* would revert — drop it */
    }
  }
  return out;
}
