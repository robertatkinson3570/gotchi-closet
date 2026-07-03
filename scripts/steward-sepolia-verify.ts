// scripts/steward-sepolia-verify.ts
// A1 verification (docs/steward/2026-07-03-finish-line-punchlist.md): prove the three Steward
// promises on Base Sepolia BEFORE enabling automation on mainnet:
//   1. SCOPE     — a session key scoped to (target, selector) is REJECTED calling anything else.
//   2. OWNER-PAYS — userOp gas debits the player's own 7702 EOA balance, nobody else's.
//   3. MECHANICS — 7702 upgrade + session enable + session-signed submit actually execute.
//
// The Aavegotchi diamonds don't exist on Sepolia, so this uses the same (target, selector)
// SHAPE as sessionSpec against the mainnet diamond address (codeless on Sepolia → an in-scope
// call is a harmless no-op; what we assert is the session module's allow/reject behavior and
// who paid the gas).
//
// Run:  npx tsx scripts/steward-sepolia-verify.ts
// Env:  STEWARD_VERIFY_OWNER_KEY  — throwaway EOA private key holding a little Base Sepolia ETH
//       RHINESTONE_API_KEY        — free-tier key from https://dashboard.rhinestone.dev
//       STEWARD_BUNDLER_URL       — optional custom bundler (e.g. Pimlico Base Sepolia URL)
//       STEWARD_VERIFY_RPC_URL    — optional, defaults to https://sepolia.base.org
import { RhinestoneSDK, type Session } from "@rhinestone/sdk";
import { baseSepolia } from "viem/chains";
import { createPublicClient, http, toFunctionSelector, type Hex, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const AAVEGOTCHI_DIAMOND: Address = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF"; // codeless on Sepolia — fine
const SEL_INTERACT = toFunctionSelector("interact(uint256[])");
const SEL_FORBIDDEN = toFunctionSelector("setPetOperatorForAll(address,bool)"); // NOT in scope — must be rejected

// interact([]) calldata: selector + abi.encode(uint256[] offset 0x20, length 0)
const CALLDATA_IN_SCOPE: Hex = `${SEL_INTERACT}${"0".repeat(62)}20${"0".repeat(64)}` as Hex;
// setPetOperatorForAll(0xdead..., true) calldata — same target, forbidden selector
const CALLDATA_OUT_OF_SCOPE: Hex =
  `${SEL_FORBIDDEN}${"0".repeat(24)}${"de".repeat(20)}${"0".repeat(63)}1` as Hex;

function req(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`✗ missing env ${name} — see docs/steward/SEPOLIA-VERIFY.md`); process.exit(1); }
  return v;
}

async function main() {
  const ownerPk = req("STEWARD_VERIFY_OWNER_KEY") as Hex;
  const apiKey = req("RHINESTONE_API_KEY");
  const bundlerUrl = process.env.STEWARD_BUNDLER_URL;
  const rpc = process.env.STEWARD_VERIFY_RPC_URL || "https://sepolia.base.org";

  const owner = privateKeyToAccount(ownerPk);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const results: { name: string; pass: boolean; detail: string }[] = [];

  console.log(`owner EOA: ${owner.address}`);
  const startBalance = await pub.getBalance({ address: owner.address });
  console.log(`balance:   ${startBalance} wei`);
  if (startBalance === 0n) { console.error("✗ owner EOA has no Sepolia ETH — fund it from a faucet first"); process.exit(1); }

  // --- session setup: mirrors src/lib/steward/aaClient.issueSessionKey, but on Sepolia ------
  const sessionPk = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPk);
  const session: Session = {
    chain: baseSepolia,
    owners: { type: "ecdsa", accounts: [sessionAccount] },
    // EXACT sessionSpec shape: one (target, selector) scoped action
    actions: [{ target: AAVEGOTCHI_DIAMOND, selector: SEL_INTERACT as Hex, policies: [{ type: "sudo" as const }] }],
  };

  const sdk = new RhinestoneSDK({ apiKey, ...(bundlerUrl ? { bundler: { type: "custom" as const, url: bundlerUrl } } : {}) });
  const account = await sdk.createAccount({
    eoa: owner,
    account: { type: "nexus" },
    owners: { type: "ecdsa", accounts: [owner] },
    experimental_sessions: { enabled: true },
  });
  const smartAccount = account.getAddress();
  console.log(`7702 account: ${smartAccount}`);
  results.push({
    name: "7702 account address == EOA address (assets never move)",
    pass: smartAccount.toLowerCase() === owner.address.toLowerCase(),
    detail: `account=${smartAccount}`,
  });

  const details = await account.experimental_getSessionDetails([session]);
  const userSignature = await account.experimental_signEnableSession(details);
  const enableData = {
    userSignature,
    hashesAndChainIds: details.hashesAndChainIds.map((h: any) => ({ chainId: BigInt(h.chainId), sessionDigest: h.sessionDigest })),
    sessionToEnableIndex: 0,
  };
  console.log("session enable signed (one owner signature) ✓");

  // --- test 1: in-scope call submits and executes; gas comes from the EOA ------------------
  // Mirrors server/steward/aa.ts makeSubmitter: reconstruct by address, sign with session key.
  const serverSide = await sdk.createAccount({ account: { type: "nexus" }, initData: { address: smartAccount as Address } });
  try {
    const result = await serverSide.sendTransaction({
      chain: baseSepolia,
      calls: [{ to: AAVEGOTCHI_DIAMOND, data: CALLDATA_IN_SCOPE, value: 0n }],
      signers: { type: "experimental_session", session, enableData },
    });
    const status = (await serverSide.waitForExecution(result)) as Record<string, any>;
    const txHash = status?.transactionHash ?? status?.receipt?.transactionHash ?? status?.receipts?.[0]?.transactionHash;
    const after = await pub.getBalance({ address: owner.address });
    results.push({ name: "IN-SCOPE call (interact selector → diamond) executes via session key", pass: true, detail: `tx=${txHash}` });
    results.push({
      name: "OWNER-PAYS: gas debited from the player's own EOA balance",
      pass: after < startBalance,
      detail: `before=${startBalance} after=${after} (Δ=${startBalance - after} wei)`,
    });
  } catch (e) {
    results.push({ name: "IN-SCOPE call (interact selector → diamond) executes via session key", pass: false, detail: String((e as Error).message).slice(0, 300) });
  }

  // --- test 2: OUT-OF-SCOPE call must be REJECTED (same target, forbidden selector) --------
  try {
    const result = await serverSide.sendTransaction({
      chain: baseSepolia,
      calls: [{ to: AAVEGOTCHI_DIAMOND, data: CALLDATA_OUT_OF_SCOPE, value: 0n }],
      signers: { type: "experimental_session", session, enableData },
    });
    await serverSide.waitForExecution(result);
    results.push({ name: "OUT-OF-SCOPE call (forbidden selector) is REJECTED", pass: false, detail: "!!! the call went through — the scope is NOT enforced. DO NOT SHIP." });
  } catch (e) {
    results.push({ name: "OUT-OF-SCOPE call (forbidden selector) is REJECTED", pass: true, detail: `rejected: ${String((e as Error).message).slice(0, 160)}` });
  }

  // --- test 3: a different target must also be rejected -------------------------------------
  try {
    const result = await serverSide.sendTransaction({
      chain: baseSepolia,
      calls: [{ to: owner.address, data: CALLDATA_IN_SCOPE, value: 0n }], // allowed selector, WRONG target
      signers: { type: "experimental_session", session, enableData },
    });
    await serverSide.waitForExecution(result);
    results.push({ name: "OUT-OF-SCOPE target (allowed selector, wrong contract) is REJECTED", pass: false, detail: "!!! went through — target pinning is NOT enforced. DO NOT SHIP." });
  } catch (e) {
    results.push({ name: "OUT-OF-SCOPE target (allowed selector, wrong contract) is REJECTED", pass: true, detail: `rejected: ${String((e as Error).message).slice(0, 160)}` });
  }

  // --- report -------------------------------------------------------------------------------
  console.log("\n================ RESULTS ================");
  for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}\n     ${r.detail}`);
  const allPass = results.every((r) => r.pass);
  console.log(allPass
    ? "\nALL CHECKS PASSED — the custody + owner-pays claims hold on Sepolia. Next: docs/steward/SEPOLIA-VERIFY.md §Go-live."
    : "\nSOME CHECKS FAILED — do NOT enable automation. Read the failing detail above.");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("verify script crashed:", e); process.exit(1); });
