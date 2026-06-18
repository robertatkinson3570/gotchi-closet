import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import snapshot from "@snapshot-labs/snapshot.js";

const SNAPSHOT_HUB = "https://hub.snapshot.org";
const SPACE = "aavegotchi.eth";

export type VoteStep = "idle" | "signing" | "success" | "error";

// Adapt a wagmi/viem wallet client to an ethers v6 signer (what snapshot.js wants).
function walletClientToSigner(client: any) {
  const { account, chain, transport } = client;
  const network = { chainId: chain?.id ?? 1, name: chain?.name ?? "ethereum" };
  const provider = new BrowserProvider(transport as any, network);
  return new JsonRpcSigner(provider, account.address);
}

/**
 * Cast an AavegotchiDAO vote on Snapshot — an off-chain EIP-712 signature, no gas.
 * `choice` shape depends on the proposal's voting `type`:
 *  single-choice/basic → number (1-based); approval/ranked-choice → number[];
 *  weighted/quadratic → { [index]: weight }.
 */
export function useSnapshotVote() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [step, setStep] = useState<VoteStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => { setStep("idle"); setError(null); }, []);

  const vote = useCallback(
    async (proposalId: string, type: string, choice: number | number[] | Record<string, number>) => {
      if (!address || !walletClient) { setStep("error"); setError("Connect your wallet"); return false; }
      setStep("signing");
      setError(null);
      try {
        const signer = walletClientToSigner(walletClient);
        const client = new snapshot.Client712(SNAPSHOT_HUB);
        await client.vote(signer as any, address, {
          space: SPACE,
          proposal: proposalId,
          type: type as any,
          choice: choice as any,
          reason: "",
          app: "gotchicloset",
        });
        setStep("success");
        return true;
      } catch (e: any) {
        setStep("error");
        setError(e?.error_description || e?.message || "Vote failed");
        return false;
      }
    },
    [address, walletClient]
  );

  return { vote, step, error, reset };
}
