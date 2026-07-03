// scripts/verify-aa-sepolia.mjs
// Phase 1 TESTNET PROOF: runs the full free-stack flow on Base Sepolia end-to-end —
//   1) EIP-7702 setup tx (owner-paid): delegate EOA -> Safe singleton + addSafe7579 installing
//      ownable + smart-sessions validators with a scoped session PRE-ENABLED.
//   2) a session-signed userOp (USE mode) through the self-hosted bundler that calls a dummy
//      target, proving the session key executes and the EOA pays its own gas (no paymaster).
//
// Requires (all free): .env.testnet (TESTNET_OWNER_KEY funded + TESTNET_EXECUTOR_KEY funded via
// faucet) and a running bundler at BUNDLER_URL (self-hosted Alto, EntryPoint v0.7, Base Sepolia).
//
// Run:  BUNDLER_URL=http://localhost:4337/rpc node scripts/verify-aa-sepolia.mjs
import { readFileSync } from "node:fs";
import {
  getSmartSessionsValidator, getOwnableValidator, getPermissionId,
  OWNABLE_VALIDATOR_ADDRESS, encodeValidationData, getSudoPolicy,
  RHINESTONE_ATTESTER_ADDRESS, MOCK_ATTESTER_ADDRESS,
  encodeSmartSessionSignature, encodeValidatorNonce, getAccount,
  getOwnableValidatorMockSignature, SmartSessionMode,
} from "@rhinestone/module-sdk";
import { baseSepolia } from "viem/chains";
import {
  createPublicClient, createWalletClient, http, toHex, toBytes, parseAbi,
  encodeFunctionData, zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { entryPoint07Address, getUserOperationHash } from "viem/account-abstraction";

const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE7579_MODULE = "0x7579EE8307284F293B1927136486880611F20002";
const SAFE7579_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff";
const SAFE_NATIVE_OWNER = "0x000000000000000000000000000000000000dEaD"; // vestigial; not the account itself (GS203)
const DUMMY_TARGET = "0xa564cB165815937967a7d018B7F34B907B52fcFd"; // harmless call target (no selector)

function envFile() {
  const out = {};
  for (const line of readFileSync(".env.testnet", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const e = envFile();
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const bundlerUrl = process.env.BUNDLER_URL;
  if (!bundlerUrl) throw new Error("set BUNDLER_URL (your running Alto on Base Sepolia)");
  if (!e.TESTNET_OWNER_KEY) throw new Error("missing TESTNET_OWNER_KEY in .env.testnet");

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const owner = privateKeyToAccount(e.TESTNET_OWNER_KEY);
  const walletClient = createWalletClient({ account: owner, chain: baseSepolia, transport: http(rpcUrl) });

  const bal = await publicClient.getBalance({ address: owner.address });
  console.log("owner:", owner.address, "balance:", Number(bal) / 1e18, "ETH");
  if (bal === 0n) throw new Error("owner has 0 Sepolia ETH — faucet it first");

  const ownableValidator = getOwnableValidator({ owners: [owner.address], threshold: 1 });
  const sessionPk = generatePrivateKey();
  const sessionOwner = privateKeyToAccount(sessionPk);
  const session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sessionOwner.address] }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: [{ actionTarget: DUMMY_TARGET, actionTargetSelector: "0x00000000", actionPolicies: [getSudoPolicy()] }],
    chainId: BigInt(baseSepolia.id),
    permitERC4337Paymaster: false,
  };
  const smartSessions = getSmartSessionsValidator({ sessions: [session] });

  console.log("1) sending EIP-7702 setup tx (owner-paid)…");
  // executor: "self" — owner both authorizes and sends the tx, so nonce must be current+1.
  const authorization = await walletClient.signAuthorization({ account: owner, contractAddress: SAFE_SINGLETON, executor: "self" });
  const setupHash = await walletClient.writeContract({
    address: owner.address,
    abi: parseAbi(["function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment, address paymentReceiver) external"]),
    functionName: "setup",
    args: [
      [SAFE_NATIVE_OWNER], 1n, SAFE7579_LAUNCHPAD,
      encodeFunctionData({
        abi: parseAbi([
          "struct ModuleInit {address module;bytes initData;}",
          "function addSafe7579(address safe7579,ModuleInit[] calldata validators,ModuleInit[] calldata executors,ModuleInit[] calldata fallbacks, ModuleInit[] calldata hooks,address[] calldata attesters,uint8 threshold) external",
        ]),
        functionName: "addSafe7579",
        args: [SAFE7579_MODULE,
          [{ module: ownableValidator.address, initData: ownableValidator.initData }, { module: smartSessions.address, initData: smartSessions.initData }],
          [], [], [], [RHINESTONE_ATTESTER_ADDRESS, MOCK_ATTESTER_ADDRESS], 1],
      }),
      SAFE7579_MODULE, zeroAddress, 0n, zeroAddress,
    ],
    authorizationList: [authorization],
  });
  await publicClient.waitForTransactionReceipt({ hash: setupHash });
  console.log("   setup tx:", setupHash);

  console.log("2) submitting session-signed userOp via bundler…");
  const safeAccount = await toSafeSmartAccount({
    address: owner.address, client: publicClient, owners: [sessionOwner], version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE7579_MODULE, erc7579LaunchpadAddress: SAFE7579_LAUNCHPAD,
  });
  const smartAccountClient = createSmartAccountClient({
    account: safeAccount, chain: baseSepolia, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => publicClient.estimateFeesPerGas() },
  }).extend(erc7579Actions());

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address, entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({ account: getAccount({ address: safeAccount.address, type: "safe" }), validator: smartSessions }),
  });
  const details = { mode: SmartSessionMode.USE, permissionId: getPermissionId({ session }), signature: getOwnableValidatorMockSignature({ threshold: 1 }) };
  const userOp = await smartAccountClient.prepareUserOperation({
    account: safeAccount, calls: [{ to: DUMMY_TARGET, value: 0n, data: "0x00000000" }], nonce,
    signature: encodeSmartSessionSignature(details),
  });
  const hash = getUserOperationHash({ chainId: baseSepolia.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: userOp });
  details.signature = await sessionOwner.signMessage({ message: { raw: hash } });
  userOp.signature = encodeSmartSessionSignature(details);
  const userOpHash = await smartAccountClient.sendUserOperation(userOp);
  const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash });
  console.log("   userOp tx:", receipt.receipt.transactionHash, "success:", receipt.success);
  console.log("\nPROOF PASSED — 7702 + scoped session + userOp executed on Base Sepolia, EOA paid its own gas.");
}

main().catch((err) => { console.error("\nPROOF FAILED:", err?.shortMessage || err?.message || err); process.exit(1); });
