// src/lib/steward/aaClient.ts
// CLIENT half of Steward Phase 1 — FREE, self-hostable stack (no paid SDK, no vendor account):
// @rhinestone/module-sdk (smart-sessions encoding) + permissionless + viem + EIP-7702.
//
// issueSessionKey: in ONE owner-signed, owner-PAID setup tx, it EIP-7702-delegates the owner's
// EOA to the Safe singleton and runs addSafe7579 to install the ownable + smart-sessions
// validators with a scoped session key PRE-ENABLED. The session may call ONLY the chosen chores'
// (target, selector) pairs (sessionSpec). The session private key + account address go to the
// server so the cron submits pet/channel/claim userOps as the player; the player's own EOA
// balance pays gas (permitERC4337Paymaster: false, no paymaster).
//
// PENDING BASE SEPOLIA VALIDATION (see feat/steward-aa): wallet EIP-7702 support
// (signAuthorization + authorizationList), the Rhinestone attester attesting these modules on
// Base, and the enable-at-setup path. Mirrors rhinestonewtf/module-sdk-tutorials permissionless-safe-7702.
import {
  getSmartSessionsValidator,
  getOwnableValidator,
  getPermissionId,
  OWNABLE_VALIDATOR_ADDRESS,
  encodeValidationData,
  getSudoPolicy,
  RHINESTONE_ATTESTER_ADDRESS,
  type Session,
} from "@rhinestone/module-sdk";
import { base } from "viem/chains";
import {
  type WalletClient,
  type Address,
  type Hex,
  createPublicClient,
  http,
  toHex,
  toBytes,
  parseAbi,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sessionActions, type ChoresLike } from "./sessionSpec";
import { enrollMessage } from "./enrollAuth";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { env } from "@/lib/env";

// Safe 1.4.1 singleton (7702 delegate), Safe7579 adapter, launchpad — deterministic across chains.
const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address;
const SAFE7579_MODULE = "0x7579EE8307284F293B1927136486880611F20002" as Address;
const SAFE7579_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff" as Address;

const rpc = () => env.baseRpcUrl || "https://mainnet.base.org";

// Stored ENCRYPTED in enrollment.sessionKey; server/steward/aa.ts rebuilds the account + session
// from it. The session key can ONLY call the scoped pet/channel/claim actions.
export interface SessionBlob {
  accountAddress: Address;
  sessionPrivateKey: Hex;
  permissionId: Hex;
  chores: ChoresLike;
  chainId: number;
}

const SET_PET_OPERATOR_ABI = [{
  name: "setPetOperatorForAll", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "_operator", type: "address" }, { name: "_approved", type: "bool" }], outputs: [],
}] as const;

export async function issueSessionKey(
  walletClient: WalletClient,
  owner: string,
  gotchiId: number,
  chores: ChoresLike
): Promise<{ smartAccount: string; sessionKey: string; ownerSig: string; signedAt: number }> {
  const account = walletClient.account;
  if (!account) throw new Error("Connect your wallet first.");
  const ownerAddr = account.address;
  const publicClient = createPublicClient({ chain: base, transport: http(rpc()) });

  const ownableValidator = getOwnableValidator({ owners: [ownerAddr], threshold: 1 });
  const sessionPk = generatePrivateKey();
  const sessionOwner = privateKeyToAccount(sessionPk);

  const session: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sessionOwner.address] }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: sessionActions(chores),
    chainId: BigInt(base.id),
    permitERC4337Paymaster: false, // the player's own EOA pays gas; no paymaster
  };
  const smartSessions = getSmartSessionsValidator({ sessions: [session] });

  // ONE owner-signed, owner-PAID setup tx: 7702-delegate the EOA to the Safe singleton and run
  // addSafe7579 to install ownable + smart-sessions validators with this session pre-enabled.
  // executor: "self" — the owner both authorizes AND sends this tx, so the authorization nonce
  // must be current+1 (the tx consumes the current nonce first). Without it the authorization
  // is silently rejected and the EOA is never delegated (proven on Base mainnet 2026-07-03).
  const authorization = await walletClient.signAuthorization({ account, contractAddress: SAFE_SINGLETON, executor: "self" });
  const txHash = await walletClient.writeContract({
    address: ownerAddr,
    abi: parseAbi([
      "function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment, address paymentReceiver) external",
    ]),
    functionName: "setup",
    args: [
      [ownerAddr], 1n, SAFE7579_LAUNCHPAD,
      encodeFunctionData({
        abi: parseAbi([
          "struct ModuleInit {address module;bytes initData;}",
          "function addSafe7579(address safe7579,ModuleInit[] calldata validators,ModuleInit[] calldata executors,ModuleInit[] calldata fallbacks, ModuleInit[] calldata hooks,address[] calldata attesters,uint8 threshold) external",
        ]),
        functionName: "addSafe7579",
        args: [
          SAFE7579_MODULE,
          [
            { module: ownableValidator.address, initData: ownableValidator.initData },
            { module: smartSessions.address, initData: smartSessions.initData },
          ],
          [], [], [],
          [RHINESTONE_ATTESTER_ADDRESS],
          1,
        ],
      }),
      SAFE7579_MODULE, zeroAddress, 0n, zeroAddress,
    ],
    account,
    chain: base,
    authorizationList: [authorization],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Bind the enrollment to the owner (server verifies this signature on /enroll).
  const smartAccount = ownerAddr;
  const signedAt = Date.now();
  const ownerSig = await walletClient.signMessage({
    account,
    message: enrollMessage({ owner, gotchiId, chores, smartAccount, signedAt }),
  });

  const blob: SessionBlob = {
    accountAddress: ownerAddr,
    sessionPrivateKey: sessionPk,
    permissionId: getPermissionId({ session }),
    chores,
    chainId: base.id,
  };
  return { smartAccount, sessionKey: JSON.stringify(blob), ownerSig, signedAt };
}

// With EIP-7702 the smart account IS the owner's EOA, so it already holds the player's ETH and
// pays its own userOp gas — no separate float to deposit. Kept as the wizard's final hook.
export async function fundGasFloat(_smartAccount: string): Promise<void> { return; }

// Dormant operator path (hidden behind VITE_STEWARD_GASLESS) — ONE normal setPetOperatorForAll
// approval any wallet can sign, no 7702. The relayer then pets (it can ONLY interact()).
export async function approveGaslessPetting(
  walletClient: WalletClient,
  owner: string,
  gotchiId: number,
  chores: ChoresLike
): Promise<{ smartAccount: string; ownerSig: string; signedAt: number; authMode: "operator" }> {
  const account = walletClient.account;
  if (!account) throw new Error("Connect your wallet first.");
  const r = await fetch(`${env.companionApiUrl}/api/steward/pet-operator`);
  const { operator, configured } = (await r.json()) as { operator: string | null; configured: boolean };
  if (!configured || !operator) throw new Error("Gasless petting isn't available right now.");

  await walletClient.writeContract({
    address: AAVEGOTCHI_DIAMOND_BASE as `0x${string}`,
    abi: SET_PET_OPERATOR_ABI,
    functionName: "setPetOperatorForAll",
    args: [operator as `0x${string}`, true],
    account,
    chain: base,
  });

  const smartAccount = owner;
  const signedAt = Date.now();
  const ownerSig = await walletClient.signMessage({
    account,
    message: enrollMessage({ owner, gotchiId, chores, smartAccount, signedAt }),
  });
  return { smartAccount, ownerSig, signedAt, authMode: "operator" };
}
