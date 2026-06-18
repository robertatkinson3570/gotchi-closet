import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { claimPremium, getPremium } from "@/lib/companion/api";

const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const ERC20_TRANSFER_ABI = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

// Keep in sync with server/companion/pricing.ts COMPANION_TIERS.
const TIERS = [{ days: 30, ghst: 5 }, { days: 90, ghst: 12 }];
const RECEIVING = import.meta.env.VITE_COMPANION_RECEIVING_WALLET as `0x${string}` | undefined;

export function GoPremium({ onActivated }: { onActivated?: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buy(days: number, ghst: number) {
    if (!address || !RECEIVING) { setMsg("premium not configured"); return; }
    setBusy(true); setMsg("confirm the GHST payment in your wallet…");
    try {
      const txHash = await writeContractAsync({
        address: GHST_BASE, abi: ERC20_TRANSFER_ABI, functionName: "transfer",
        args: [RECEIVING, parseUnits(String(ghst), 18)],
      });
      setMsg("verifying on-chain…");
      await claimPremium(address, days, txHash);
      const status = await getPremium(address);
      setMsg(status.active ? `premium active — ${status.daysLeft} days ✨` : "claim pending…");
      if (status.active) onActivated?.();
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || "payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
      <div className="text-xs font-medium text-fuchsia-100">✨ Go Premium — smarter replies (OpenAI)</div>
      <div className="mt-2 flex gap-2">
        {TIERS.map((t) => (
          <button key={t.days} disabled={busy} onClick={() => buy(t.days, t.ghst)}
            className="flex-1 rounded-lg bg-fuchsia-500/80 px-2 py-1.5 text-xs text-white disabled:opacity-40">
            {t.days}d · {t.ghst} GHST
          </button>
        ))}
      </div>
      {msg && <div className="mt-2 text-[11px] text-white/70">{msg}</div>}
    </div>
  );
}
