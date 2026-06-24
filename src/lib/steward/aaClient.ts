// src/lib/steward/aaClient.ts
// CLIENT half of the Steward AA seam (EIP-7702 + ERC-7579 smart session via @rhinestone/sdk).
//
// issueSessionKey: upgrades the owner's EOA to a 7702 smart account, generates a fresh
// session keypair scoped to ONLY the chosen chores' selectors (sessionSpec), and asks the
// owner to sign the session-enable once. It returns the session PRIVATE key + enable data in
// a blob the server stores so the cron can submit as the player — the key can do nothing but
// pet/channel/claim, and the player's own EOA balance pays gas (no operator funds, no
// paymaster needed because the 7702 account IS the EOA).
//
// VERIFY ON BASE SEPOLIA before mainnet: the exact 7702 account flavour ('nexus'), the
// enable-on-first-use handoff to the server, and gas payment from the EOA balance. Keep all
// SDK-version-specific code in this file + server/steward/aa.ts.
import { RhinestoneSDK, walletClientToAccount, type Session } from "@rhinestone/sdk";
import { base } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { WalletClient } from "viem";
import { sessionActions, type ChoresLike } from "./sessionSpec";
import { enrollMessage } from "./enrollAuth";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { env } from "@/lib/env";

// One fragment for the Ledger-friendly operator approval.
const SET_PET_OPERATOR_ABI = [{
  name: "setPetOperatorForAll", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "_operator", type: "address" }, { name: "_approved", type: "bool" }], outputs: [],
}] as const;

const RHINESTONE_API_KEY = import.meta.env.VITE_RHINESTONE_API_KEY as string | undefined;
const BUNDLER_URL = import.meta.env.VITE_STEWARD_BUNDLER_URL as string | undefined;

function sdk(): RhinestoneSDK {
  if (!RHINESTONE_API_KEY) throw new Error("Steward AA not configured (set VITE_RHINESTONE_API_KEY).");
  return new RhinestoneSDK({
    apiKey: RHINESTONE_API_KEY,
    ...(BUNDLER_URL ? { bundler: { type: "custom", url: BUNDLER_URL } } : {}),
  });
}

// Serialized into the enrollment.sessionKey column; server/steward/aa.ts rebuilds the session
// from it. Holds the scoped session private key + the owner's one-time enable signature.
export interface SessionBlob {
  pk: `0x${string}`;
  chores: ChoresLike;
  enable: { userSignature: `0x${string}`; hashesAndChainIds: { chainId: string; sessionDigest: `0x${string}` }[]; sessionToEnableIndex: number };
}

export async function issueSessionKey(
  walletClient: WalletClient,
  owner: string,
  gotchiId: number,
  chores: ChoresLike
): Promise<{ smartAccount: string; sessionKey: string; ownerSig: string; signedAt: number }> {
  const ownerAccount = walletClientToAccount(walletClient);
  const sessionPk = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPk);

  const session: Session = {
    chain: base,
    owners: { type: "ecdsa", accounts: [sessionAccount] },
    actions: sessionActions(chores),
  };

  const account = await sdk().createAccount({
    eoa: ownerAccount,
    account: { type: "nexus" },
    owners: { type: "ecdsa", accounts: [ownerAccount] },
    experimental_sessions: { enabled: true },
  });

  // One owner signature enables the scoped session (enabled lazily on the first server run).
  const details = await account.experimental_getSessionDetails([session]);
  const userSignature = await account.experimental_signEnableSession(details);

  const blob: SessionBlob = {
    pk: sessionPk,
    chores,
    enable: {
      userSignature,
      hashesAndChainIds: details.hashesAndChainIds.map((h) => ({ chainId: h.chainId.toString(), sessionDigest: h.sessionDigest })),
      sessionToEnableIndex: 0,
    },
  };

  // Owner signs an enrollment authorization the server verifies (proves ownership + binds terms).
  const smartAccount = account.getAddress();
  const signedAt = Date.now();
  const ownerSig = await walletClient.signMessage({
    account: ownerAccount,
    message: enrollMessage({ owner, gotchiId, chores, smartAccount, signedAt }),
  });
  return { smartAccount, sessionKey: JSON.stringify(blob), ownerSig, signedAt };
}

// With EIP-7702 the smart account IS the owner's EOA, so it already holds the player's ETH
// and pays its own userOp gas — there's no separate float to deposit. Kept as the wizard's
// final step hook; wire a balance check / top-up prompt here if desired.
export async function fundGasFloat(_smartAccount: string): Promise<void> {
  return;
}

// Ledger-friendly fallback: ONE normal approval (setPetOperatorForAll) any wallet can sign,
// no EIP-7702. The relayer then pets on the owner's behalf (it can ONLY interact()). Returns
// the operator-mode enrollment fields (no session key; the owner's EOA is the "account").
export async function approveGaslessPetting(
  walletClient: WalletClient,
  owner: string,
  gotchiId: number,
  chores: ChoresLike
): Promise<{ smartAccount: string; ownerSig: string; signedAt: number; authMode: "operator" }> {
  const r = await fetch(`${env.companionApiUrl}/api/steward/pet-operator`);
  const { operator, configured } = (await r.json()) as { operator: string | null; configured: boolean };
  if (!configured || !operator) throw new Error("Gasless petting isn't available right now.");

  const ownerAccount = walletClientToAccount(walletClient);
  // One on-chain approval — any wallet (incl. Ledger) signs this normal tx.
  await walletClient.writeContract({
    address: AAVEGOTCHI_DIAMOND_BASE as `0x${string}`,
    abi: SET_PET_OPERATOR_ABI,
    functionName: "setPetOperatorForAll",
    args: [operator as `0x${string}`, true],
    account: ownerAccount,
    chain: base,
  });

  // Operator mode runs as the owner's own EOA (no 7702 upgrade) — bind the enrollment to it.
  const smartAccount = owner;
  const signedAt = Date.now();
  const ownerSig = await walletClient.signMessage({
    account: ownerAccount,
    message: enrollMessage({ owner, gotchiId, chores, smartAccount, signedAt }),
  });
  return { smartAccount, ownerSig, signedAt, authMode: "operator" };
}
