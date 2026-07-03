// scripts/dryrun-setup.mjs
// FREE (read-only, zero gas, zero spend) validation of the Steward 7702 setup call. Simulates
// setup(...) via eth_call with a stateOverride that puts the Safe singleton's runtime code at
// the proof owner address — so we exercise the exact Safe setup path (GS-codes and all) without
// sending a transaction or needing a delegation. Use this to iterate the setup encoding before
// ever spending on a real setup tx.
//
// Run:  node scripts/dryrun-setup.mjs   (owner from .env.testnet, Base mainnet)
import { readFileSync } from "node:fs";
import {
  getSmartSessionsValidator, getOwnableValidator, OWNABLE_VALIDATOR_ADDRESS,
  encodeValidationData, getSudoPolicy, RHINESTONE_ATTESTER_ADDRESS,
} from "@rhinestone/module-sdk";
import { base } from "viem/chains";
import { createPublicClient, http, toHex, toBytes, parseAbi, encodeFunctionData, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE7579_MODULE = "0x7579EE8307284F293B1927136486880611F20002";
const SAFE7579_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff";
const SAFE_NATIVE_OWNER = "0x000000000000000000000000000000000000dEaD";
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
  const pub = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const owner = privateKeyToAccount(e.TESTNET_OWNER_KEY);

  const ownableValidator = getOwnableValidator({ owners: [owner.address], threshold: 1 });
  const sessionOwner = privateKeyToAccount(generatePrivateKey());
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

  const setupData = encodeFunctionData({
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
          [], [], [],
          // NO_ATTEST=1 disables the attester threshold to isolate whether attestation is the GS000 cause.
          process.env.NO_ATTEST === "1" ? [] : [RHINESTONE_ATTESTER_ADDRESS],
          process.env.NO_ATTEST === "1" ? 0 : 1],
      }),
      SAFE7579_MODULE, zeroAddress, 0n, zeroAddress,
    ],
  });

  // Put the Safe singleton runtime code at the owner address (simulates the 7702-delegated state).
  const singletonCode = await pub.getCode({ address: SAFE_SINGLETON });
  console.log("owner:", owner.address, "| singleton code len:", singletonCode?.length);

  try {
    await pub.call({
      account: owner.address, to: owner.address, data: setupData,
      stateOverride: [{ address: owner.address, code: singletonCode }],
    });
    console.log("\nDRY-RUN PASSED — setup(...) does not revert with SAFE_NATIVE_OWNER = burn address.");
    console.log("Safe to run the real proof: BUNDLER_URL=... node scripts/verify-aa-mainnet.mjs");
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err);
    console.log("\nDRY-RUN REVERTED:", msg.slice(0, 400));
    process.exit(1);
  }
}

main().catch((err) => { console.error("dry-run crashed:", err?.shortMessage || err?.message || err); process.exit(1); });
