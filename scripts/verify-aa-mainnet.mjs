// scripts/verify-aa-mainnet.mjs
// Phase 1 PROOF on Base MAINNET (or an anvil fork of it — set RPC_URL/BUNDLER_URL). Proves the
// whole free-stack hands-off flow end to end AND the custody boundary:
//   0) SELF-ATTEST: SmartSessions is NOT attested by Rhinestone on Base, so our own attester
//      attests it once (reusing Rhinestone's module schema). Accounts then trust
//      [Rhinestone (=ownable), ourAttester (=SmartSessions)] with threshold 1.
//   1) EIP-7702 setup tx (owner-paid, executor:'self'): delegate EOA -> Safe singleton +
//      addSafe7579 installing ownable + smart-sessions validators, session pre-enabled. Safe
//      native owner = burn address (NOT the account itself -> avoids GS203).
//   2) IN-SCOPE session userOp executes; owner EOA balance drops (OWNER-PAYS).
//   3) OUT-OF-SCOPE selector rejected. 4) OUT-OF-SCOPE target rejected.
//
// Env: RPC_URL (default https://mainnet.base.org), BUNDLER_URL (Alto), keys in .env.testnet
//      (TESTNET_OWNER_KEY = the player; TESTNET_EXECUTOR_KEY = our attester, must be funded).
import { readFileSync } from "node:fs";
import {
  getSmartSessionsValidator, getOwnableValidator, getPermissionId, SMART_SESSIONS_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS, encodeValidationData, getSudoPolicy, RHINESTONE_ATTESTER_ADDRESS,
  REGISTRY_ADDRESS, encodeSmartSessionSignature, encodeValidatorNonce, getAccount,
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
const SAFE_NATIVE_OWNER = "0x000000000000000000000000000000000000dEaD"; // vestigial; not the account itself (GS203)
// Rhinestone's module schema on Base (reused for our SmartSessions attestation).
const MODULE_SCHEMA = "0x93d46fcca4ef7d66a413c7bde08bb1ff14bacbd04c4069bb24cd7c21729d7bf1";
const DUMMY_TARGET = "0x74B1be1bbced1eb31f58BE6562C3340fe941e027"; // in-scope action target (no code -> no-op)

function envFile() {
  const out = {};
  for (const line of readFileSync(".env.testnet", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const sortAddrs = (a) => [...a].sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : 1));

async function main() {
  const e = envFile();
  const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";
  const bundlerUrl = process.env.BUNDLER_URL;
  if (!bundlerUrl) throw new Error("set BUNDLER_URL (your running Alto)");
  if (!e.TESTNET_OWNER_KEY || !e.TESTNET_EXECUTOR_KEY) throw new Error("need TESTNET_OWNER_KEY + TESTNET_EXECUTOR_KEY in .env.testnet");

  const t = http(rpcUrl);
  const publicClient = createPublicClient({ chain: base, transport: t });
  const owner = privateKeyToAccount(e.TESTNET_OWNER_KEY);
  const attester = privateKeyToAccount(e.TESTNET_EXECUTOR_KEY); // our own attester for SmartSessions
  const ownerWallet = createWalletClient({ account: owner, chain: base, transport: t });
  const attWallet = createWalletClient({ account: attester, chain: base, transport: t });

  console.log("owner:", owner.address, formatEther(await publicClient.getBalance({ address: owner.address })), "ETH");
  console.log("attester:", attester.address);

  // --- step 0: ensure SmartSessions is attested by our attester (one-time, global per module) ---
  const checkAbi = parseAbi(["function check(address module,address[] attesters,uint256 threshold) view"]);
  let ssAttested = true;
  try { await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: checkAbi, functionName: "check", args: [SMART_SESSIONS_ADDRESS, [attester.address], 1n] }); }
  catch { ssAttested = false; }
  if (!ssAttested) {
    console.log("0) self-attesting SmartSessions (one-time)…");
    const h = await attWallet.writeContract({
      address: REGISTRY_ADDRESS,
      abi: parseAbi(["function attest(bytes32 schemaUID,(address moduleAddr,uint48 expirationTime,bytes data,uint256[] moduleTypes) request)"]),
      functionName: "attest",
      args: [MODULE_SCHEMA, { moduleAddr: SMART_SESSIONS_ADDRESS, expirationTime: 0, data: "0x", moduleTypes: [1n] }],
    });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log("   attest tx:", h);
  } else console.log("0) SmartSessions already attested by our attester ✓");

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
  // ownable is attested by Rhinestone; SmartSessions by our attester. Trust both, threshold 1.
  const attesters = sortAddrs([RHINESTONE_ATTESTER_ADDRESS, attester.address]);

  console.log("1) EIP-7702 setup tx (owner-paid)…");
  const authorization = await ownerWallet.signAuthorization({ account: owner, contractAddress: SAFE_SINGLETON, executor: "self" });
  const setupHash = await ownerWallet.writeContract({
    address: owner.address,
    abi: parseAbi(["function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)"]),
    functionName: "setup",
    args: [
      [SAFE_NATIVE_OWNER], 1n, SAFE7579_LAUNCHPAD,
      encodeFunctionData({
        abi: parseAbi([
          "struct ModuleInit {address module;bytes initData;}",
          "function addSafe7579(address safe7579,ModuleInit[] validators,ModuleInit[] executors,ModuleInit[] fallbacks,ModuleInit[] hooks,address[] attesters,uint8 threshold)",
        ]),
        functionName: "addSafe7579",
        args: [SAFE7579_MODULE,
          [{ module: ownableValidator.address, initData: ownableValidator.initData }, { module: smartSessions.address, initData: smartSessions.initData }],
          [], [], [], attesters, 1],
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
    account: safeAccount, chain: base, bundlerTransport: http(bundlerUrl, { timeout: 180_000 }),
    userOperation: { estimateFeesPerGas: async () => publicClient.estimateFeesPerGas() },
  }).extend(erc7579Actions());

  async function sessionUserOp(call) {
    const nonce = await getAccountNonce(publicClient, {
      address: safeAccount.address, entryPointAddress: entryPoint07Address,
      key: encodeValidatorNonce({ account: getAccount({ address: safeAccount.address, type: "safe" }), validator: smartSessions }),
    });
    const details = { mode: SmartSessionMode.USE, permissionId: getPermissionId({ session }), signature: getOwnableValidatorMockSignature({ threshold: 1 }) };
    const userOp = await smartAccountClient.prepareUserOperation({ account: safeAccount, calls: [call], nonce, signature: encodeSmartSessionSignature(details) });
    const hash = getUserOperationHash({ chainId: base.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: userOp });
    details.signature = await sessionOwner.signMessage({ message: { raw: hash } });
    userOp.signature = encodeSmartSessionSignature(details);
    const uoHash = await smartAccountClient.sendUserOperation(userOp);
    return smartAccountClient.waitForUserOperationReceipt({ hash: uoHash });
  }

  const results = [];
  console.log("2) IN-SCOPE session userOp…");
  const before = await publicClient.getBalance({ address: owner.address });
  try {
    const r = await sessionUserOp({ to: DUMMY_TARGET, value: 0n, data: "0x00000000" });
    const after = await publicClient.getBalance({ address: owner.address });
    results.push({ n: "IN-SCOPE call executes via scoped session key", pass: r.success, d: `tx=${r.receipt.transactionHash}` });
    results.push({ n: "OWNER-PAYS: owner EOA balance dropped by userOp gas", pass: after < before, d: `Δ=${formatEther(before - after)} ETH` });
  } catch (err) { results.push({ n: "IN-SCOPE call executes", pass: false, d: String(err?.shortMessage || err?.message).slice(0, 200) }); }

  console.log("3) OUT-OF-SCOPE selector (must reject)…");
  try { await sessionUserOp({ to: DUMMY_TARGET, value: 0n, data: "0x11111111" }); results.push({ n: "OUT-OF-SCOPE selector REJECTED", pass: false, d: "!!! executed — scope NOT enforced" }); }
  catch (err) { results.push({ n: "OUT-OF-SCOPE selector REJECTED", pass: true, d: `rejected: ${String(err?.shortMessage || err?.message).slice(0, 100)}` }); }

  console.log("4) OUT-OF-SCOPE target (must reject)…");
  try { await sessionUserOp({ to: owner.address, value: 0n, data: "0x00000000" }); results.push({ n: "OUT-OF-SCOPE target REJECTED", pass: false, d: "!!! executed — target pinning NOT enforced" }); }
  catch (err) { results.push({ n: "OUT-OF-SCOPE target REJECTED", pass: true, d: `rejected: ${String(err?.shortMessage || err?.message).slice(0, 100)}` }); }

  console.log("\n================ RESULTS ================");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.n}\n      ${r.d}`);
  const all = results.every((r) => r.pass);
  console.log(all ? "\nPROOF PASSED — 7702 + scoped session + owner-pays work; out-of-scope rejected." : "\nPROOF FAILED.");
  process.exit(all ? 0 : 1);
}
main().catch((err) => { console.error("\nPROOF CRASHED:", err?.shortMessage || err?.message || err); process.exit(1); });
