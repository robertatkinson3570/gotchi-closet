// server/steward/aa.ts
// SERVER half of the Steward AA seam. The cron submits each due run AS THE PLAYER using the
// scoped session key the wizard issued (EIP-7702 + ERC-7579 smart session via @rhinestone/sdk).
// The session can call ONLY the chores' (target, selector) actions (see sessionSpec), and the
// player's own 7702 EOA balance pays gas — the operator funds nothing.
//
// PIN @rhinestone/sdk to the installed version and VERIFY ON BASE SEPOLIA before mainnet:
//   - reconstructing the account from its address + session signer (no owner key here),
//   - the enable-on-first-use handoff (enableData) from the client,
//   - tx-hash extraction from waitForExecution.
// The Submitter interface is the stable contract the runner/cron depend on; everything below
// is the SDK-version-specific seam.
import { RhinestoneSDK, type Session, type SessionEnableData } from "@rhinestone/sdk";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { sessionActions } from "../../src/lib/steward/sessionSpec";
import type { SessionBlob } from "../../src/lib/steward/aaClient";
import type { Enrollment } from "./db";
import type { Call } from "./encode";

export interface Submitter { submit(enrollment: Enrollment, calls: Call[]): Promise<string>; }

export function makeSubmitter(): Submitter {
  return {
    async submit(enrollment: Enrollment, calls: Call[]): Promise<string> {
      if (!enrollment.smartAccount || !enrollment.sessionKey) {
        throw new Error(`enrollment ${enrollment.id} missing smartAccount/sessionKey`);
      }
      const apiKey = process.env.RHINESTONE_API_KEY;
      if (!apiKey) throw new Error("Steward AA not configured (set RHINESTONE_API_KEY)");
      const bundlerUrl = process.env.STEWARD_BUNDLER_URL;

      const blob = JSON.parse(enrollment.sessionKey) as SessionBlob;
      const sessionAccount = privateKeyToAccount(blob.pk);
      const session: Session = {
        chain: base,
        owners: { type: "ecdsa", accounts: [sessionAccount] },
        actions: sessionActions(blob.chores),
      };
      const enableData: SessionEnableData = {
        userSignature: blob.enable.userSignature,
        hashesAndChainIds: blob.enable.hashesAndChainIds.map((h) => ({ chainId: BigInt(h.chainId), sessionDigest: h.sessionDigest })),
        sessionToEnableIndex: blob.enable.sessionToEnableIndex,
      };

      const sdk = new RhinestoneSDK({
        apiKey,
        ...(bundlerUrl ? { bundler: { type: "custom" as const, url: bundlerUrl } } : {}),
      });
      // Reconstruct the player's account from its address alone (no owner key server-side);
      // the session key in `signers` authorizes + signs the batched call.
      const account = await sdk.createAccount({
        account: { type: "nexus" },
        initData: { address: enrollment.smartAccount as `0x${string}` },
      });

      // ONE batched transaction for the whole run -> overhead paid once (cheapest gas).
      const result = await account.sendTransaction({
        chain: base,
        calls: calls.map((c) => ({ to: c.to, data: c.data, value: 0n })),
        signers: { type: "experimental_session", session, enableData },
      });
      const status = (await account.waitForExecution(result)) as Record<string, any>;
      return (
        status?.transactionHash ??
        status?.receipt?.transactionHash ??
        status?.receipts?.[0]?.transactionHash ??
        (result as Record<string, any>)?.id?.toString?.() ??
        "submitted"
      );
    },
  };
}
