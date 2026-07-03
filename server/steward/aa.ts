// server/steward/aa.ts
// SERVER half of Steward Phase 1 — FREE stack (no paid SDK): @rhinestone/module-sdk +
// permissionless + viem. The cron submits each due run AS THE PLAYER using the scoped session
// key the wizard pre-enabled. The session can call ONLY the chores' (target, selector) actions
// (sessionSpec); the player's own 7702 EOA balance pays gas (no paymaster). Bundler is the
// self-hosted STEWARD_BUNDLER_URL (Alto/Rundler on the VPS).
//
// PENDING BASE SEPOLIA VALIDATION (feat/steward-aa). Submitter is the stable contract the
// runner/cron depend on; everything below is the version-specific seam.
import {
  getSmartSessionsValidator,
  encodeSmartSessionSignature,
  encodeValidatorNonce,
  getAccount,
  getOwnableValidatorMockSignature,
  SmartSessionMode,
} from "@rhinestone/module-sdk";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { entryPoint07Address, getUserOperationHash } from "viem/account-abstraction";
import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { SessionBlob } from "../../src/lib/steward/aaClient";
import type { Enrollment } from "./db";
import type { Call } from "./encode";

const SAFE7579_MODULE = "0x7579EE8307284F293B1927136486880611F20002" as Address;
const SAFE7579_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff" as Address;

export interface Submitter { submit(enrollment: Enrollment, calls: Call[]): Promise<string>; }

export function makeSubmitter(): Submitter {
  return {
    async submit(enrollment: Enrollment, calls: Call[]): Promise<string> {
      if (!enrollment.sessionKey) throw new Error(`enrollment ${enrollment.id} missing sessionKey`);
      const bundlerUrl = process.env.STEWARD_BUNDLER_URL;
      if (!bundlerUrl) throw new Error("Steward bundler not configured (set STEWARD_BUNDLER_URL)");
      const rpcUrl = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";

      const blob = JSON.parse(enrollment.sessionKey) as SessionBlob;
      const sessionSigner = privateKeyToAccount(blob.sessionPrivateKey);
      const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

      // Reconstruct the player's Safe7579 account from its address alone (no owner key here);
      // the session key authorizes + signs the batched call via the smart-sessions validator.
      const safeAccount = await toSafeSmartAccount({
        address: blob.accountAddress,
        client: publicClient,
        owners: [sessionSigner], // placeholder; the session validates the op, not this owner
        version: "1.4.1",
        entryPoint: { address: entryPoint07Address, version: "0.7" },
        safe4337ModuleAddress: SAFE7579_MODULE,
        erc7579LaunchpadAddress: SAFE7579_LAUNCHPAD,
      });

      const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: base,
        bundlerTransport: http(bundlerUrl),
        userOperation: { estimateFeesPerGas: async () => publicClient.estimateFeesPerGas() },
      }).extend(erc7579Actions());

      const smartSessions = getSmartSessionsValidator({});
      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({ account: getAccount({ address: safeAccount.address, type: "safe" }), validator: smartSessions }),
      });

      // USE mode (session was pre-enabled at setup). Mock sig first for accurate gas estimation,
      // then replace with the real session-key signature over the userOp hash.
      const sessionDetails = {
        mode: SmartSessionMode.USE,
        permissionId: blob.permissionId,
        signature: getOwnableValidatorMockSignature({ threshold: 1 }),
      };

      // ONE batched userOp for the whole run -> overhead paid once (cheapest gas).
      const userOperation = await smartAccountClient.prepareUserOperation({
        account: safeAccount,
        calls: calls.map((c) => ({ to: c.to, value: 0n, data: c.data })),
        nonce,
        signature: encodeSmartSessionSignature(sessionDetails),
      });

      const userOpHashToSign = getUserOperationHash({
        chainId: base.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });
      sessionDetails.signature = await sessionSigner.signMessage({ message: { raw: userOpHashToSign } });
      userOperation.signature = encodeSmartSessionSignature(sessionDetails);

      const userOpHash = await smartAccountClient.sendUserOperation(userOperation);
      const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash: userOpHash });
      return receipt.receipt.transactionHash;
    },
  };
}
