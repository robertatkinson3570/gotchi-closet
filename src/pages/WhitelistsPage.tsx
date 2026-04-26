import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { ArrowLeft, Users, Plus, X, UserPlus, UserMinus, Loader2, CheckCircle2, Save, ArrowRightLeft } from "lucide-react";
import { client } from "@/graphql/client";
import { WHITELIST_DETAIL } from "@/graphql/whitelistDetailQuery";
import { useWhitelistsForAddress } from "@/hooks/useWhitelists";
import { useCreateWhitelist, useUpdateWhitelist, useTransferWhitelist } from "@/hooks/useLendingTx";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";

export default function WhitelistsPage() {
  const { address, isConnected } = useAccount();
  const { isOnBase } = useAddressState();
  const { asOwner, loading } = useWhitelistsForAddress(address ?? null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const create = useCreateWhitelist();
  useEffect(() => {
    if (create.step === "success") {
      toast({ title: "Whitelist created", description: "Refresh to see it in the list." });
      setCreating(false);
      create.reset();
    }
  }, [create.step, create, toast]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <Seo
        title="Whitelists — GotchiCloset"
        description="Create and manage borrower whitelists for your Aavegotchi rentals."
        canonical={siteUrl("/lending/whitelists")}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to="/lending/me"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to my lendings
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Whitelists</h1>
          <p className="text-sm text-muted-foreground">
            Restrict who can borrow your gotchis to specific addresses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!isConnected || !isOnBase}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> New whitelist
        </button>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <p className="text-sm font-medium mb-3">Connect a wallet to manage whitelists</p>
          <ConnectButton />
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted/30 animate-pulse rounded" />
          ))}
        </div>
      ) : asOwner.length === 0 ? (
        <div className="rounded-xl glass p-8 text-center">
          <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">No whitelists yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Whitelists let you restrict your listings to specific borrower addresses (friends, guild members).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {asOwner.map((wl) => (
            <div
              key={wl.id}
              className="rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
            >
              <button
                type="button"
                onClick={() => setActiveId(activeId === wl.id ? null : wl.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div>
                  <div className="font-medium">{wl.name || `Whitelist #${wl.id}`}</div>
                  <div className="text-xs text-muted-foreground">
                    id {wl.id}
                    {wl.maxBorrowLimit ? ` · borrow limit ${wl.maxBorrowLimit}` : ""}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeId === wl.id ? "Hide" : "Manage"}
                </span>
              </button>
              {activeId === wl.id && <WhitelistDetail id={wl.id} />}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateWhitelistModal
          onClose={() => {
            setCreating(false);
            create.reset();
          }}
          onSubmit={(name, addrs) => create.send(name, addrs)}
          step={create.step}
          errorMsg={create.errorMsg}
        />
      )}
    </div>
  );
}

function WhitelistDetail({ id }: { id: string }) {
  const [members, setMembers] = useState<string[] | null>(null);
  const [maxBorrowLimit, setMaxBorrowLimit] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [addInput, setAddInput] = useState("");
  const [transferInput, setTransferInput] = useState("");
  const [removingAddrs, setRemovingAddrs] = useState<Set<string>>(new Set());
  const update = useUpdateWhitelist();
  const transfer = useTransferWhitelist();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .query(WHITELIST_DETAIL, { id }, { requestPolicy: "network-only" })
      .toPromise()
      .then((res) => {
        if (cancelled) return;
        const wl = res.data?.whitelist;
        const memberArr = Array.isArray(wl?.members) ? wl.members : [];
        setMembers(memberArr.map((m: any) => String(m).toLowerCase()));
        if (wl?.maxBorrowLimit != null) {
          setMaxBorrowLimit(String(wl.maxBorrowLimit));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (update.step === "success") {
      toast({ title: "Whitelist updated", description: "Refresh to see updated members." });
      update.reset();
    }
  }, [update.step, update, toast]);

  useEffect(() => {
    if (transfer.step === "success") {
      toast({
        title: "Ownership transferred",
        description: "This whitelist now belongs to the new owner.",
      });
      setTransferInput("");
      transfer.reset();
    }
  }, [transfer.step, transfer, toast]);

  const handleAdd = () => {
    const lines = addInput
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[a-fA-F0-9]{40}$/.test(s));
    if (!lines.length) return;
    update.add(Number(id), lines as `0x${string}`[]);
    setAddInput("");
  };

  const handleRemove = (addr: string) => {
    setRemovingAddrs((prev) => new Set(prev).add(addr));
    update.remove(Number(id), [addr as `0x${string}`]);
  };

  const busy = update.step === "submitting" || update.step === "confirming";

  return (
    <div className="border-t border-border/30 px-4 py-3 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Add members (comma/newline-separated 0x addresses)
        </div>
        <textarea
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          placeholder="0xabc…, 0xdef…"
          className="w-full h-20 px-2 py-1.5 rounded border border-border/40 bg-background/70 text-xs font-mono"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!addInput.trim() || busy}
          className="mt-1.5 inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Members ({members?.length ?? 0})
        </div>
        {loading ? (
          <div className="h-8 bg-muted/30 animate-pulse rounded" />
        ) : !members || members.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No members yet</div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m}
                className="flex items-center justify-between rounded border border-border/30 bg-background/50 px-2 py-1 text-xs"
              >
                <span className="font-mono">{m}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(m)}
                  disabled={busy || removingAddrs.has(m)}
                  className="text-destructive hover:text-destructive/80 disabled:opacity-50"
                  title="Remove from whitelist"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {update.errorMsg && update.step === "error" && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive break-words">
          {update.errorMsg.slice(0, 200)}
        </div>
      )}

      {/* Borrow limit ----------------------------------------------------- */}
      <div className="border-t border-border/30 pt-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Borrow limit per address
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={maxBorrowLimit}
            onChange={(e) => setMaxBorrowLimit(e.target.value)}
            placeholder="0 = unlimited"
            className="w-32 h-8 px-2 rounded border border-border/40 bg-background/70 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              const v = Number(maxBorrowLimit);
              if (!Number.isFinite(v) || v < 0) return;
              update.setLimit(Number(id), BigInt(Math.floor(v)));
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary/15 text-primary hover:bg-primary/25 text-xs font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
          <span className="text-[10px] text-muted-foreground">
            max # of active rentals each member can have from your gotchis
          </span>
        </div>
      </div>

      {/* Ownership transfer ----------------------------------------------- */}
      <div className="border-t border-border/30 pt-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Transfer ownership of this whitelist
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={transferInput}
            onChange={(e) => setTransferInput(e.target.value)}
            placeholder="0x… new owner"
            className="flex-1 h-8 px-2 rounded border border-border/40 bg-background/70 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => {
              if (!/^0x[a-fA-F0-9]{40}$/.test(transferInput.trim())) return;
              if (!confirm(
                `Transfer whitelist #${id} to ${transferInput.trim()}? You will lose admin rights.`
              )) return;
              transfer.send(Number(id), transferInput.trim() as `0x${string}`);
            }}
            disabled={
              transfer.step === "submitting" ||
              transfer.step === "confirming" ||
              !/^0x[a-fA-F0-9]{40}$/.test(transferInput.trim())
            }
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold disabled:opacity-50"
          >
            {transfer.step === "submitting" || transfer.step === "confirming" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-3.5 h-3.5" />
            )}
            Transfer
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Permanent. You'll lose admin rights to add/remove members on this whitelist.
        </p>
        {transfer.errorMsg && transfer.step === "error" && (
          <div className="mt-1 rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive break-words">
            {transfer.errorMsg.slice(0, 200)}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateWhitelistModal({
  onClose,
  onSubmit,
  step,
  errorMsg,
}: {
  onClose: () => void;
  onSubmit: (name: string, addrs: `0x${string}`[]) => void;
  step: string;
  errorMsg: string | null;
}) {
  const [name, setName] = useState("");
  const [addrs, setAddrs] = useState("");

  const handle = () => {
    const lines = addrs
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[a-fA-F0-9]{40}$/.test(s));
    if (!name.trim()) return;
    onSubmit(name.trim(), lines as `0x${string}`[]);
  };

  const busy = step === "submitting" || step === "confirming";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h2 className="font-semibold">New whitelist</h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-muted/60 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friends"
              className="w-full h-9 mt-0.5 px-2 rounded border border-border/40 bg-background/70 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Initial members (optional)
            </label>
            <textarea
              value={addrs}
              onChange={(e) => setAddrs(e.target.value)}
              placeholder="0xabc…, 0xdef…"
              className="w-full h-20 mt-0.5 px-2 py-1.5 rounded border border-border/40 bg-background/70 text-xs font-mono"
            />
          </div>
          {step === "success" ? (
            <div className="rounded border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Created
            </div>
          ) : (
            <button
              type="button"
              onClick={handle}
              disabled={!name.trim() || busy}
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {busy ? (step === "submitting" ? "Submitting…" : "Confirming…") : "Create whitelist"}
            </button>
          )}
          {errorMsg && step === "error" && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive break-words">
              {errorMsg.slice(0, 200)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
