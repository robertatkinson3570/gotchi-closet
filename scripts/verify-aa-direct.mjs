// scripts/verify-aa-direct.mjs
// Phase 1 PROOF that does NOT depend on a bundler — submits the session userOp straight to the
// EntryPoint via handleOps (the script acts as the bundler). More robust than the Alto path for
// verification (Alto's gas estimator misbehaves on anvil forks). Proves, end to end:
//   0) self-attest SmartSessions (idempotent; skipped if already attested)
//   1) EIP-7702 owner-paid setup (executor:'self' + burn-address Safe owner)
//   2) IN-SCOPE session userOp EXECUTES (UserOperationEvent.success == true) and the owner EOA
//      pays the gas
//   3) OUT-OF-SCOPE selector  -> handleOps REVERTS (validation rejects it)
//   4) OUT-OF-SCOPE target    -> handleOps REVERTS
//
// A FRESH owner is generated each run (so the account is never already-set-up) and funded from
// the attester/executor wallet. Env: RPC_URL (default mainnet), keys in .env.testnet
// (TESTNET_EXECUTOR_KEY = attester + funder + handleOps submitter, must hold a little ETH).
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
  encodeFunctionData, zeroAddress, formatEther, decodeEventLog,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { entryPoint07Address, entryPoint07Abi, getUserOperationHash, toPackedUserOperation } from "viem/account-abstraction";

const SING = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", MOD = "0x7579EE8307284F293B1927136486880611F20002";
const LP = "0x7579011aB74c46090561ea277Ba79D510c6C00ff", DEAD = "0x000000000000000000000000000000000000dEaD";
const SCHEMA = "0x93d46fcca4ef7d66a413c7bde08bb1ff14bacbd04c4069bb24cd7c21729d7bf1";

function envFile() {
  const out = {};
  for (const line of readFileSync(".env.testnet", "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim(); }
  return out;
}
const sortA = (a) => [...a].sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : 1));

async function main() {
  const e = envFile();
  const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";
  const t = http(rpcUrl);
  const pub = createPublicClient({ chain: base, transport: t });
  const att = privateKeyToAccount(e.TESTNET_EXECUTOR_KEY);         // attester + funder + submitter
  const attW = createWalletClient({ account: att, chain: base, transport: t });
  const owner = privateKeyToAccount(generatePrivateKey());          // FRESH account each run
  const ownerW = createWalletClient({ account: owner, chain: base, transport: t });
  const DUMMY = att.address;                                        // in-scope action target (no code => no-op)
  console.log("attester/funder:", att.address, formatEther(await pub.getBalance({ address: att.address })), "ETH");
  console.log("fresh owner:", owner.address);

  // 0) attest SmartSessions if needed
  const checkAbi = parseAbi(["function check(address module,address[] attesters,uint256 threshold) view"]);
  let attested = true;
  try { await pub.readContract({ address: REGISTRY_ADDRESS, abi: checkAbi, functionName: "check", args: [SMART_SESSIONS_ADDRESS, [att.address], 1n] }); } catch { attested = false; }
  if (!attested) {
    const h = await attW.writeContract({ address: REGISTRY_ADDRESS, abi: parseAbi(["function attest(bytes32 s,(address moduleAddr,uint48 expirationTime,bytes data,uint256[] moduleTypes) r)"]), functionName: "attest", args: [SCHEMA, { moduleAddr: SMART_SESSIONS_ADDRESS, expirationTime: 0, data: "0x", moduleTypes: [1n] }] });
    await pub.waitForTransactionReceipt({ hash: h }); console.log("attested SmartSessions:", h);
  } else console.log("SmartSessions already attested by our attester ✓");

  // fund the fresh owner. On a local anvil fork use anvil_setBalance (avoids the fork's
  // inflated fee estimate rejecting the transfer, and strands no real ETH); on mainnet, transfer.
  if (/localhost|127\.0\.0\.1/.test(rpcUrl)) {
    await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [owner.address, "0x2386f26fc10000"] }) });
  } else {
    const fundHash = await attW.sendTransaction({ to: owner.address, value: 700000000000000n }); // 0.0007 ETH
    await pub.waitForTransactionReceipt({ hash: fundHash });
  }

  const ov = getOwnableValidator({ owners: [owner.address], threshold: 1 });
  const sess = privateKeyToAccount(generatePrivateKey());
  const session = { sessionValidator: OWNABLE_VALIDATOR_ADDRESS, sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sess.address] }), salt: toHex(toBytes("0", { size: 32 })), userOpPolicies: [getSudoPolicy()], erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] }, actions: [{ actionTarget: DUMMY, actionTargetSelector: "0x00000000", actionPolicies: [getSudoPolicy()] }], chainId: BigInt(base.id), permitERC4337Paymaster: false };
  const ss = getSmartSessionsValidator({ sessions: [session] });
  const atts = sortA([RHINESTONE_ATTESTER_ADDRESS, att.address]);

  // 1) setup (owner-paid)
  const auth = await ownerW.signAuthorization({ account: owner, contractAddress: SING, executor: "self" });
  const setupData = encodeFunctionData({ abi: parseAbi(["function setup(address[] o,uint256 t,address to,bytes d,address fh,address pt,uint256 p,address pr)"]), functionName: "setup", args: [[DEAD], 1n, LP, encodeFunctionData({ abi: parseAbi(["struct ModuleInit {address module;bytes initData;}", "function addSafe7579(address s,ModuleInit[] v,ModuleInit[] e,ModuleInit[] f,ModuleInit[] h,address[] a,uint8 t)"]), functionName: "addSafe7579", args: [MOD, [{ module: ov.address, initData: ov.initData }, { module: ss.address, initData: ss.initData }], [], [], [], atts, 1] }), MOD, zeroAddress, 0n, zeroAddress] });
  const setupHash = await ownerW.sendTransaction({ to: owner.address, data: setupData, gas: 1500000n, authorizationList: [auth] });
  const setupRc = await pub.waitForTransactionReceipt({ hash: setupHash });
  console.log("setup:", setupHash, setupRc.status);
  if (setupRc.status !== "success") throw new Error("setup reverted");

  const safe = await toSafeSmartAccount({ address: owner.address, client: pub, owners: [sess], version: "1.4.1", entryPoint: { address: entryPoint07Address, version: "0.7" }, safe4337ModuleAddress: MOD, erc7579LaunchpadAddress: LP });
  async function op(call) {
    const nonce = await getAccountNonce(pub, { address: owner.address, entryPointAddress: entryPoint07Address, key: encodeValidatorNonce({ account: getAccount({ address: owner.address, type: "safe" }), validator: ss }) });
    const callData = await safe.encodeCalls([call]); const fees = await pub.estimateFeesPerGas();
    const uo = { sender: owner.address, nonce, callData, callGasLimit: 700000n, verificationGasLimit: 2000000n, preVerificationGas: 300000n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, signature: encodeSmartSessionSignature({ mode: SmartSessionMode.USE, permissionId: getPermissionId({ session }), signature: getOwnableValidatorMockSignature({ threshold: 1 }) }) };
    const h = getUserOperationHash({ chainId: base.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: uo });
    uo.signature = encodeSmartSessionSignature({ mode: SmartSessionMode.USE, permissionId: getPermissionId({ session }), signature: await sess.signMessage({ message: { raw: h } }) });
    const packed = toPackedUserOperation(uo);
    // Simulate first (free): out-of-scope userOps revert here (SmartSessions rejects at
    // validation), so we detect rejection with no on-chain spend and get the revert reason.
    try { await pub.simulateContract({ account: att.address, address: entryPoint07Address, abi: entryPoint07Abi, functionName: "handleOps", args: [[packed], att.address], gas: 4000000n }); }
    catch (err) { return { rejected: true, reason: (err.shortMessage || err.message).slice(0, 80) }; }
    if (process.env.SIMULATE_ONLY === "1") return { simulatedOk: true };
    const hash = await attW.writeContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "handleOps", args: [[packed], att.address], gas: 4000000n });
    const r = await pub.waitForTransactionReceipt({ hash });
    let success = null;
    for (const l of r.logs) { try { const d = decodeEventLog({ abi: entryPoint07Abi, data: l.data, topics: l.topics }); if (d.eventName === "UserOperationEvent") success = d.args.success; } catch {} }
    return { tx: hash, handleOps: r.status, userOpSuccess: success };
  }

  const results = [];
  const before = await pub.getBalance({ address: owner.address });
  const inR = await op({ to: DUMMY, value: 0n, data: "0x00000000" });
  const after = await pub.getBalance({ address: owner.address });
  results.push({ n: "IN-SCOPE session userOp executes", pass: inR.simulatedOk === true || (inR.handleOps === "success" && inR.userOpSuccess === true), d: JSON.stringify(inR) });
  if (!inR.simulatedOk) results.push({ n: "OWNER-PAYS: owner EOA balance dropped", pass: before - after > 0n, d: `Δ=${formatEther(before - after)} ETH` });
  // Out-of-scope: SmartSessions rejects at validation, so handleOps REVERTS on-chain (status
  // "reverted") — that IS the rejection, whether it throws pre-flight or mines as reverted.
  const rejected = (r) => !!r.rejected || r.handleOps === "reverted";
  const selR = await op({ to: DUMMY, value: 0n, data: "0x11111111" });
  results.push({ n: "OUT-OF-SCOPE selector REJECTED", pass: rejected(selR), d: JSON.stringify(selR) });
  const tgtR = await op({ to: owner.address, value: 0n, data: "0x00000000" });
  results.push({ n: "OUT-OF-SCOPE target REJECTED", pass: rejected(tgtR), d: JSON.stringify(tgtR) });

  console.log("\n================ RESULTS ================");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.n}\n      ${r.d}`);
  const all = results.every((r) => r.pass);
  console.log(all ? `\nPROOF PASSED on ${rpcUrl} — 7702 + scoped session + owner-pays; out-of-scope rejected.` : "\nPROOF FAILED.");
  process.exit(all ? 0 : 1);
}
main().catch((err) => { console.error("\nCRASHED:", err?.shortMessage || err?.message || err); process.exit(1); });
