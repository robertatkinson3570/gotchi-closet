import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { HeartHandshake, Loader2, Check, X } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

const PET_OPERATOR_ABI = [
  { name: "isPetOperatorForAll", type: "function", stateMutability: "view", inputs: [{ name: "_owner", type: "address" }, { name: "_operator", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "setPetOperatorForAll", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_operator", type: "address" }, { name: "_approved", type: "bool" }], outputs: [] },
] as const;

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim());

/**
 * Account-level "pet operator" approval: let another address (a pet bot / friend)
 * pet ALL your gotchis on your behalf via setPetOperatorForAll. Reads the live
 * approval state for the entered operator so the button reflects allow vs revoke.
 */
export function PetOperatorControl() {
  const { address } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = isAddr(operator);

  const { data: approved, refetch } = useReadContract({
    address: AAVEGOTCHI_DIAMOND_BASE,
    abi: PET_OPERATOR_ABI,
    functionName: "isPetOperatorForAll",
    args: address && valid ? [address, operator.trim() as `0x${string}`] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && valid },
  });

  const setApproval = async (next: boolean) => {
    if (!publicClient || !valid) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: PET_OPERATOR_ABI,
        functionName: "setPetOperatorForAll",
        args: [operator.trim() as `0x${string}`, next],
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: next ? "Petting access granted" : "Petting access revoked", description: `${operator.slice(0, 6)}…${operator.slice(-4)}` });
      refetch();
    } catch (e) {
      toast({ title: "Failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
        <HeartHandshake className="w-4 h-4 text-rose-400" /> Pet operator
      </div>
      <div className="rounded-xl border border-border/40 bg-background/60 p-3">
        <p className="text-[11px] text-muted-foreground mb-2">Let another wallet (a pet bot or friend) pet all your gotchis to keep kinship up. They can only pet, never move or sell.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="0x operator address"
            className="h-10 flex-1 min-w-0 rounded-lg bg-muted/40 border border-border/50 focus:border-primary/60 outline-none px-3 text-sm font-mono"
          />
          {valid && approved ? (
            <button disabled={busy} onClick={() => setApproval(false)} className="h-10 px-4 rounded-lg bg-destructive/15 text-destructive border border-destructive/40 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Revoke
            </button>
          ) : (
            <button disabled={!valid || busy} onClick={() => setApproval(true)} className="h-10 px-4 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartHandshake className="w-4 h-4" />} Allow petting
            </button>
          )}
        </div>
        {valid && approved && (
          <div className="mt-2 text-[11px] text-emerald-500 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> This address can currently pet your gotchis.</div>
        )}
      </div>
    </div>
  );
}
