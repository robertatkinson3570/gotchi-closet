// server/games/ownership.ts
// Sybil gate: a submitter must hold at least one Aavegotchi. ERC-721 balanceOf on the
// Base diamond (same address the Steward reads). Fails closed — callers treat a thrown
// error as "couldn't verify", never as a pass.
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND } from "../steward/abi";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const erc721Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function ownsAavegotchi(wallet: string): Promise<boolean> {
  const bal = (await client.readContract({
    address: AAVEGOTCHI_DIAMOND,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [wallet as `0x${string}`],
  })) as bigint;
  return bal > 0n;
}
