// server/steward/aa.ts
// EIP-7702 + ERC-7579 smart-session submitter. The player's EOA is 7702-delegated to a
// smart account; a session key (scoped to interact/channelAlchemica/claimAllAvailableAlchemica)
// signs one userOp batching all calls; the Pimlico paymaster charges the player's gas float.
//
// PIN permissionless to the installed minor (0.2.57) and verify the smart-session + 7702
// helpers against current Pimlico docs before prod. The Submitter interface is the stable
// contract the runner depends on; load7702SessionAccount is the ONLY SDK-version-specific seam.
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { Enrollment } from "./db";
import type { Call } from "./encode";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const BUNDLER = process.env.STEWARD_BUNDLER_URL || ""; // https://api.pimlico.io/v2/8453/rpc?apikey=...

export interface Submitter { submit(enrollment: Enrollment, calls: Call[]): Promise<string>; }

export function makeSubmitter(): Submitter {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const pimlico = createPimlicoClient({ transport: http(BUNDLER) });

  return {
    async submit(enrollment: Enrollment, calls: Call[]): Promise<string> {
      if (!enrollment.smartAccount || !enrollment.sessionKey) {
        throw new Error(`enrollment ${enrollment.id} missing smartAccount/sessionKey`);
      }
      const account = await load7702SessionAccount(publicClient, enrollment);
      const smart = createSmartAccountClient({
        account,
        chain: base,
        bundlerTransport: http(BUNDLER),
        paymaster: pimlico,
        userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
      });
      // ONE userOp batching every call this cycle -> overhead paid once (cheapest gas).
      const hash = await smart.sendUserOperation({ calls });
      const receipt = await smart.waitForUserOperationReceipt({ hash });
      return receipt.receipt.transactionHash as Hex;
    },
  };
}

// Reconstructs the player's 7702 smart account + session-key signer from the stored
// enrollment, against the pinned permissionless 7702 + smart-session API. This is the single
// SDK-version-specific function; the runner/tests never call it (they use a fake submit).
async function load7702SessionAccount(_publicClient: unknown, _enrollment: Enrollment): Promise<any> {
  throw new Error("wire load7702SessionAccount to the pinned permissionless 7702 smart-session API");
}
