// scripts/verify-aa-mainnet.mjs
// Phase 1 MAINNET PROOF (pennies, funded from the pet relayer via the one-off GH workflow):
// runs the full free-stack flow on Base MAINNET end-to-end and, unlike the sepolia harness,
// also proves the CUSTODY boundary:
//   1) EIP-7702 setup tx (owner-paid): delegate EOA -> Safe singleton + addSafe7579 installing
//      ownable + smart-sessions validators with a scoped session PRE-ENABLED.
//   2) IN-SCOPE session-signed userOp executes — and the owner EOA's balance drops by the gas
//      cost (OWNER-PAYS proof; the bundler executor is reimbursed in-protocol).
//   3) OUT-OF-SCOPE selector (same target) is REJECTED.
//   4) OUT-OF-SCOPE target (allowed selector) is REJECTED.
//
// Requires: .env.testnet keys funded on Base mainnet (~0.0035 each) and a running Alto at
// BUNDLER_URL pointed at Base mainnet.
// Run:  BUNDLER_URL=http://localhost:4337 node scripts/verify-aa-mainnet.mjs
import { readFileSync } from "node:fs";
import {
  getSmartSessionsValidator, getOwnableValidator, getPermissionId,
  OWNABLE_VALIDATOR_ADDRESS, encodeValidationData, getSudoPolicy,
  RHINESTONE_ATTESTER_ADDRESS,
  encodeSmartSessionSignature, encodeValidatorNonce, getAccount,
  getOwnableValidatorMockSignature, SmartSessionMode,
} from "@rhinestone/module-sdk";
import { base } from "viem/chains";
import {
  createPublicClient, createWalletClient, http, toHex, toBytes, parseAbi,
  encodeFunctionData, zeroAddress, formatEther,
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
// Harmless in-scope target: the fresh proof executor EOA (no code on mainnet — a bare call no-ops).
const DUMMY_TARGET = "0x74B1be1bbced1eb31f58BE6562C3340fe941e027";

function envFile() {
  const out = {};
  for (const line of readFileSync(".env.testnet", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const e = envFile();
  const rpcUrl = process.env.MAINNET_RPC_URL || "https://mainnet.base.org";
  const bundlerUrl = process.env.BUNDLER_URL;
  if (!bundlerUrl) throw new Error("set BUNDLER_URL (your running Alto on Base mainnet)");
  if (!e.TESTNET_OWNER_KEY) throw new Error("missing TESTNET_OWNER_KEY in .env.testnet");

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const owner = privateKeyToAccount(e.TESTNET_OWNER_KEY);
  const walletClient = createWalletClient({ account: owner, chain: base, transport: http(rpcUrl) });

  const bal = await publicClient.getBalance({ address: owner.address });
  console.log("owner:", owner.address, "balance:", formatEther(bal), "ETH");
  if (bal === 0n) throw new Error("owner has 0 mainnet ETH — run the steward-fund-proof workflow first");

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
    chainId: BigInt(base.id),
    permitERC4337Paymaster: false,
  };
  const smartSessions = getSmartSessionsValidator({ sessions: [session] });

  console.log("1) sending EIP-7702 setup tx (owner-paid)…");
  const authorization = await walletClient.signAuthorization({ account: owner, contractAddress: SAFE_SINGLETON });
  const setupHash = await walletClient.writeContract({
    address: owner.address,
    abi: parseAbi(["function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment, address paymentReceiver) external"]),
    functionName: "setup",
    args: [
      [owner.address], 1n, SAFE7579_LAUNCHPAD,
      encodeFunctionData({
        abi: parseAbi([
          "struct ModuleInit {address module;bytes initData;}",
          "function addSafe7579(address safe7579,ModuleInit[] calldata validators,ModuleInit[] calldata executors,ModuleInit[] calldata fallbacks, ModuleInit[] calldata hooks,address[] calldata attesters,uint8 threshold) external",
        ]),
        functionName: "addSafe7579",
        args: [SAFE7579_MODULE,
          [{ module: ownableValidator.address, initData: ownableValidator.initData }, { module: smartSessions.address, initData: smartSessions.initData }],
          // Mainnet: the real Rhinestone attester only (mock attester is testnet-only).
          [], [], [], [RHINESTONE_ATTESTER_ADDRESS], 1],
      }),
      SAFE7579_MODULE, zeroAddress, 0n, zeroAddress,
    ],
    authorizationList: [authorization],
  });
  await publicClient.waitForTransactionReceipt({ hash: setupHash });
  console.log("   setup tx:", setupHash);

  const safeAccount = await toSafeSmartAccount({
    address: owner.address, client: publicClient, owners: [sessionOwner], version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE7579_MODULE, erc7579LaunchpadAddress: SAFE7579_LAUNCHPAD,
  });
  const smartAccountClient = createSmartAccountClient({
    account: safeAccount, chain: base, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => publicClient.estimateFeesPerGas() },
  }).extend(erc7579Actions());

  // Shared: build, session-sign, and submit ONE userOp for the given call.
  async function sessionUserOp(call) {
    const nonce = await getAccountNonce(publicClient, {
      address: safeAccount.address, entryPointAddress: entryPoint07Address,
      key: encodeValidatorNonce({ account: getAccount({ address: safeAccount.address, type: "safe" }), validator: smartSessions }),
    });
    const details = { mode: SmartSessionMode.USE, permissionId: getPermissionId({ session }), signature: getOwnableValidatorMockSignature({ threshold: 1 }) };
    const userOp = await smartAccountClient.prepareUserOperation({
      account: safeAccount, calls: [call], nonce, signature: encodeSmartSessionSignature(details),
    });
    const hash = getUserOperationHash({ chainId: base.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: userOp });
    details.signature = await sessionOwner.signMessage({ message: { raw: hash } });
    userOp.signature = encodeSmartSessionSignature(details);
    const userOpHash = await smartAccountClient.sendUserOperation(userOp);
    return smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash });
  }

  const results = [];

  console.log("2) IN-SCOPE session userOp (allowed target+selector)…");
  const before = await publicClient.getBalance({ address: owner.address });
  try {
    const receipt = await sessionUserOp({ to: DUMMY_TARGET, value: 0n, data: "0x00000000" });
    const after = await publicClient.getBalance({ address: owner.address });
    results.push({ name: "IN-SCOPE call executes via scoped session key", pass: receipt.success, detail: `tx=${receipt.receipt.transactionHash}` });
    results.push({ name: "OWNER-PAYS: owner EOA balance dropped by the userOp gas", pass: after < before, detail: `Δ=${formatEther(before - after)} ETH` });
  } catch (err) {
    results.push({ name: "IN-SCOPE call executes via scoped session key", pass: false, detail: String(err?.shortMessage || err?.message).slice(0, 300) });
  }

  console.log("3) OUT-OF-SCOPE selector (must be rejected)…");
  try {
    await sessionUserOp({ to: DUMMY_TARGET, value: 0n, data: "0x11111111" });
    results.push({ name: "OUT-OF-SCOPE selector REJECTED", pass: false, detail: "!!! executed — scope NOT enforced. DO NOT SHIP." });
  } catch (err) {
    results.push({ name: "OUT-OF-SCOPE selector REJECTED", pass: true, detail: `rejected: ${String(err?.shortMessage || err?.message).slice(0, 160)}` });
  }

  console.log("4) OUT-OF-SCOPE target (must be rejected)…");
  try {
    await sessionUserOp({ to: owner.address, value: 0n, data: "0x00000000" });
    results.push({ name: "OUT-OF-SCOPE target REJECTED", pass: false, detail: "!!! executed — target pinning NOT enforced. DO NOT SHIP." });
  } catch (err) {
    results.push({ name: "OUT-OF-SCOPE target REJECTED", pass: true, detail: `rejected: ${String(err?.shortMessage || err?.message).slice(0, 160)}` });
  }

  console.log("\n================ RESULTS ================");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
  const all = results.every((r) => r.pass);
  console.log(all ? "\nPROOF PASSED on Base MAINNET — scope enforced, owner pays, machinery works." : "\nPROOF FAILED — do NOT enable automation.");
  process.exit(all ? 0 : 1);
}

main().catch((err) => { console.error("\nPROOF CRASHED:", err?.shortMessage || err?.message || err); process.exit(1); });
