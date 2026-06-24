// server/steward/petRelayer.ts
// Operator-pattern petting — the Ledger-friendly fallback (no EIP-7702). The owner approves
// this relayer once via setPetOperatorForAll; the relayer may then ONLY interact() on their
// behalf (never transfer/sell/spend — that's the whole point of the pet-operator role). The
// relayer pays the (pennies) gas: this is the deliberate trade for a no-7702 path, and the
// ONLY place the operator pays. Mirrors server/lending/relist.ts.
//
// Live seam: needs STEWARD_PET_RELAYER_KEY funded with a little Base ETH. Verify on Base
// Sepolia before mainnet.
import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND, PET_ABI } from "./abi";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";

let _account: PrivateKeyAccount | null = null;
function relayerAccount(): PrivateKeyAccount | null {
  if (_account) return _account;
  const key = process.env.STEWARD_PET_RELAYER_KEY;
  if (!key) return null;
  _account = privateKeyToAccount(key as Hex);
  return _account;
}

// The address owners approve via setPetOperatorForAll (derived from the relayer key). Null if
// the operator fallback isn't configured.
export function petOperatorAddress(): string | null {
  return relayerAccount()?.address ?? null;
}

const publicClient = createPublicClient({ chain: base, transport: http(RPC) });

// Pet the given gotchis as the owner's approved operator. Verifies the on-chain approval first
// (so a revoked/spoofed enrollment is skipped, never wasting gas) and returns the tx hash.
export async function petAsOperator(owner: string, gotchiIds: number[]): Promise<string> {
  const account = relayerAccount();
  if (!account) throw new Error("Steward pet operator not configured (set STEWARD_PET_RELAYER_KEY)");
  if (!gotchiIds.length) throw new Error("no gotchis to pet");

  const approved = (await publicClient.readContract({
    address: AAVEGOTCHI_DIAMOND, abi: PET_ABI, functionName: "isPetOperatorForAll",
    args: [owner as Hex, account.address],
  })) as boolean;
  if (!approved) throw new Error("relayer is not an approved pet operator for this owner");

  const hash = await createWalletClient({ account, chain: base, transport: http(RPC) }).writeContract({
    address: AAVEGOTCHI_DIAMOND, abi: PET_ABI, functionName: "interact",
    args: [gotchiIds.map(BigInt)], chain: base, account,
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return hash;
}
