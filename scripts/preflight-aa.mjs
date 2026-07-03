// scripts/preflight-aa.mjs
// Phase 1 PREFLIGHT (no funds needed): confirm every contract our AA flow depends on is deployed
// on the target chains, and that the pure module-sdk encoders work. Catches "module not on this
// chain" + API-shape bugs BEFORE the funded testnet proof.
//
// Run:  node scripts/preflight-aa.mjs
import {
  getSmartSessionsValidator, getOwnableValidator, getPermissionId,
  OWNABLE_VALIDATOR_ADDRESS, encodeValidationData, getSudoPolicy,
  RHINESTONE_ATTESTER_ADDRESS, MOCK_ATTESTER_ADDRESS,
} from "@rhinestone/module-sdk";
import { base, baseSepolia } from "viem/chains";
import { createPublicClient, http, toHex, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const HARDCODED = {
  "EntryPoint v0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "Safe singleton 1.4.1": "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  "Safe7579 module": "0x7579EE8307284F293B1927136486880611F20002",
  "Safe7579 launchpad": "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
};

async function checkChain(chain, rpcUrl) {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const ownable = getOwnableValidator({ owners: ["0x000000000000000000000000000000000000dEaD"], threshold: 1 });
  const sessionOwner = privateKeyToAccount(generatePrivateKey());
  const session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sessionOwner.address] }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: [{ actionTarget: "0x000000000000000000000000000000000000dEaD", actionTargetSelector: "0x12345678", actionPolicies: [getSudoPolicy()] }],
    chainId: BigInt(chain.id),
    permitERC4337Paymaster: false,
  };
  const smartSessions = getSmartSessionsValidator({ sessions: [session] });

  const targets = {
    ...HARDCODED,
    "OwnableValidator": OWNABLE_VALIDATOR_ADDRESS,
    "SmartSessions validator": smartSessions.address,
    "Rhinestone attester": RHINESTONE_ATTESTER_ADDRESS,
    "Mock attester": MOCK_ATTESTER_ADDRESS,
  };

  console.log(`\n=== ${chain.name} (${chain.id}) ===`);
  let allOk = true;
  for (const [name, addr] of Object.entries(targets)) {
    const code = await client.getBytecode({ address: addr }).catch(() => undefined);
    const ok = !!code && code !== "0x";
    // The Mock attester is testnet-only and is NOT used in production (prod uses the Rhinestone
    // attester alone), so its absence on mainnet does not block us.
    const optional = name === "Mock attester";
    if (!ok && !optional) allOk = false;
    const tag = ok ? "OK  " : optional ? "n/a " : "MISSING ";
    console.log(`${tag} ${name.padEnd(24)} ${addr}${!ok && optional ? "  (testnet-only, unused in prod)" : ""}`);
  }
  const pid = getPermissionId({ session });
  console.log(`encoders: permissionId=${pid.slice(0, 12)}…  ownable.initData len=${ownable.initData.length}  ${allOk ? "ALL DEPLOYED" : "SOME MISSING"}`);
  return allOk;
}

const a = await checkChain(baseSepolia, process.env.SEPOLIA_RPC_URL || "https://sepolia.base.org");
const b = await checkChain(base, process.env.BASE_RPC_URL || "https://mainnet.base.org");
console.log(`\nPreflight: Base Sepolia ${a ? "READY" : "BLOCKED"} · Base mainnet ${b ? "READY" : "BLOCKED"}`);
