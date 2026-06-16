import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Heart, Pencil, Sparkles, Send, Flame, Loader2 } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

// Owner-action functions across the diamond's facets (game, collateral, ERC721).
const ACTIONS_ABI = [
  { name: "interact", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenIds", type: "uint256[]" }], outputs: [] },
  { name: "setAavegotchiName", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_name", type: "string" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
  { name: "decreaseAndDestroy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_toId", type: "uint256" }], outputs: [] },
  { name: "safeTransferFrom", type: "function", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
] as const;

type Props = { gotchiId: string; currentName?: string };

const TRAITS = ["NRG", "AGG", "SPK", "BRN"] as const;

/**
 * Owner actions for an Aavegotchi (pet, rename, spend skill points, transfer,
 * sacrifice). All signed in the browser wallet; the contract enforces ownership
 * so non-owners' calls simply revert.
 */
export function GotchiActionsPanel({ gotchiId, currentName }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [showName, setShowName] = useState(false);
  const [name, setName] = useState(currentName ?? "");
  const [showSkill, setShowSkill] = useState(false);
  const [sp, setSp] = useState<[string, string, string, string]>(["0", "0", "0", "0"]);
  const [showXfer, setShowXfer] = useState(false);
  const [to, setTo] = useState("");

  const run = async (key: string, fn: () => Promise<`0x${string}`>, okMsg: string) => {
    if (!isConnected || !address || !publicClient) {
      toast({ title: "Connect wallet", variant: "destructive" });
      return;
    }
    if (!isOnBase) {
      toast({ title: "Switch to Base", variant: "destructive" });
      return;
    }
    setBusy(key);
    try {
      const hash = await fn();
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: okMsg });
      setShowName(false);
      setShowSkill(false);
      setShowXfer(false);
    } catch (e) {
      toast({ title: "Action failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const id = BigInt(gotchiId);
  const w = (functionName: string, args: any[]) =>
    writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ACTIONS_ABI, functionName: functionName as any, args: args as any });

  const Btn = ({ k, icon, label, onClick, danger }: { k: string; icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      type="button"
      disabled={busy !== null || !isConnected}
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium border disabled:opacity-50 ${
        danger ? "border-red-500/40 text-red-500 hover:bg-red-500/10" : "border-border/50 hover:bg-muted/50"
      }`}
    >
      {busy === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-2 pt-2 border-t border-border/30">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Owner actions</div>
      <div className="flex flex-wrap gap-1.5">
        <Btn k="pet" icon={<Heart className="w-3.5 h-3.5" />} label="Pet" onClick={() => run("pet", () => w("interact", [[id]]), "Petted")} />
        <Btn k="name" icon={<Pencil className="w-3.5 h-3.5" />} label="Rename" onClick={() => setShowName((s) => !s)} />
        <Btn k="skill" icon={<Sparkles className="w-3.5 h-3.5" />} label="Skill pts" onClick={() => setShowSkill((s) => !s)} />
        <Btn k="xfer" icon={<Send className="w-3.5 h-3.5" />} label="Transfer" onClick={() => setShowXfer((s) => !s)} />
        <Btn
          k="sac"
          danger
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Sacrifice"
          onClick={() => {
            if (!window.confirm(`Sacrifice gotchi #${gotchiId}? This is IRREVERSIBLE — it destroys the gotchi and returns its staked collateral.`)) return;
            run("sac", () => w("decreaseAndDestroy", [id, id]), "Sacrificed");
          }}
        />
      </div>

      {showName && (
        <div className="flex items-center gap-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New name" className="h-7 flex-1 min-w-0 rounded border border-border bg-background px-1.5 text-xs" />
          <button disabled={busy !== null || !name.trim()} onClick={() => run("name", () => w("setAavegotchiName", [id, name.trim()]), "Renamed")} className="h-7 px-2 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">
            Save
          </button>
        </div>
      )}

      {showSkill && (
        <div className="space-y-1">
          <div className="grid grid-cols-4 gap-1">
            {TRAITS.map((t, i) => (
              <label key={t} className="text-[10px] text-muted-foreground">
                {t}
                <input
                  type="number"
                  value={sp[i]}
                  onChange={(e) => setSp((p) => { const n = [...p] as typeof p; n[i] = e.target.value; return n; })}
                  className="h-6 w-full rounded border border-border bg-background px-1 text-xs"
                />
              </label>
            ))}
          </div>
          <button
            disabled={busy !== null}
            onClick={() => run("skill", () => w("spendSkillPoints", [id, sp.map((v) => Math.trunc(Number(v) || 0))]), "Skill points spent")}
            className="h-7 w-full rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Spend skill points
          </button>
        </div>
      )}

      {showXfer && (
        <div className="flex items-center gap-1">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x recipient" className="h-7 flex-1 min-w-0 rounded border border-border bg-background px-1.5 text-xs" />
          <button
            disabled={busy !== null || !/^0x[a-fA-F0-9]{40}$/.test(to)}
            onClick={() => run("xfer", () => w("safeTransferFrom", [address as `0x${string}`, to as `0x${string}`, id]), "Transferred")}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
