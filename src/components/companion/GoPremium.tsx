import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { claimPremium, getPremium } from "@/lib/companion/api";
import { env } from "@/lib/env";

const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const ERC20_TRANSFER_ABI = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const PACKS = [{ ghst: 500, credits: 5000 }, { ghst: 1000, credits: 12000 }];
const RECEIVING = env.companionReceivingWallet as `0x${string}` | undefined;

export function GoPremium({ onActivated }: { onActivated?: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buy(ghst: number) {
    if (!address) { setMsg("connect your wallet first"); return; }
    if (!RECEIVING || !/^0x[0-9a-fA-F]{40}$/.test(RECEIVING)) { setMsg("premium not configured"); return; }
    setBusy(true); setMsg("confirm the GHST payment in your wallet…");
    try {
      const txHash = await writeContractAsync({
        address: GHST_BASE, abi: ERC20_TRANSFER_ABI, functionName: "transfer",
        args: [RECEIVING, parseUnits(String(ghst), 18)],
      });
      setMsg("verifying on-chain…");
      await claimPremium(address, ghst, txHash);
      const status = await getPremium(address);
      setMsg(status.active ? `premium active · ${status.credits.toLocaleString()} credits ✨` : "claim pending…");
      if (status.active) onActivated?.();
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || "payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
      <div className="text-xs font-medium text-fuchsia-100">✨ Go Premium · sharper replies &amp; roast edge</div>
      <div className="mt-2 flex gap-2">
        {PACKS.map((p) => (
          <button key={p.ghst} disabled={busy} onClick={() => buy(p.ghst)}
            className="flex-1 rounded-lg bg-fuchsia-500/80 px-2 py-1.5 text-xs text-white disabled:opacity-40">
            {p.credits.toLocaleString()} credits · {p.ghst} GHST
          </button>
        ))}
      </div>
      {msg && <div className="mt-2 text-[11px] text-white/70">{msg}</div>}
    </div>
  );
}
