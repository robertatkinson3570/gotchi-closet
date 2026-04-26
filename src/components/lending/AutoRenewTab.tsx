import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  RotateCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  useAutoRenewTemplates,
  setTemplateEnabled,
  type AutoRenewTemplate,
} from "@/hooks/useAutoRenewTemplates";
import { useSetLendingOperator } from "@/hooks/useLendingTx";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";
import { env } from "@/lib/env";

export function AutoRenewTab() {
  const { address, isConnected } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const { templates, loading, error, reload } = useAutoRenewTemplates(address);
  const setOp = useSetLendingOperator();
  const [pendingId, setPendingId] = useState<number | null>(null);

  // After successful on-chain operator change, hit backend then refresh
  useEffect(() => {
    if (setOp.step !== "success" || pendingId == null) return;
    (async () => {
      try {
        // We just revoked the operator on-chain → also flip backend off
        await setTemplateEnabled(pendingId, false);
        toast({
          title: "Auto-renew disabled",
          description: `#${pendingId} won't be re-listed automatically.`,
        });
        reload();
      } catch (err: any) {
        toast({
          title: "Backend update failed",
          description: err?.message ?? String(err),
          variant: "destructive",
        });
      } finally {
        setPendingId(null);
        setOp.reset();
      }
    })();
  }, [setOp.step, pendingId, reload, toast, setOp]);

  if (!env.autoRenewApiUrl) {
    return (
      <div className="rounded-xl glass p-6 text-center max-w-md mx-auto">
        <p className="text-sm font-medium">Auto-renew not configured</p>
        <p className="text-xs text-muted-foreground mt-1">
          Set <code className="text-[10px]">VITE_AUTORENEW_API_URL</code> in the client env.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-xl glass p-6 text-center max-w-md mx-auto">
        <p className="text-sm font-medium mb-3">
          Connect a wallet to manage auto-renew
        </p>
        <ConnectButton />
      </div>
    );
  }

  const handleDisable = (t: AutoRenewTemplate) => {
    if (!isOnBase || !env.autoRenewOperator) return;
    setPendingId(t.token_id);
    setOp.send(env.autoRenewOperator as `0x${string}`, t.token_id, false);
  };

  const handleReEnable = async (t: AutoRenewTemplate) => {
    try {
      // Just turn the backend flag back on. The on-chain operator approval
      // remains valid as long as the user didn't explicitly revoke it.
      await setTemplateEnabled(t.token_id, true);
      toast({
        title: "Auto-renew re-enabled",
        description: `#${t.token_id} will be re-listed when the next rental ends.`,
      });
      reload();
    } catch (err: any) {
      toast({
        title: "Failed to re-enable",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Templates registered with the GotchiCloset auto-renew backend.
        </p>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-1 h-8 px-2 rounded text-xs border border-border/40 hover:bg-muted/50 transition-colors"
          title="Refresh"
        >
          <RotateCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 mb-3 text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted/30 animate-pulse rounded" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl glass p-8 text-center">
          <RotateCw className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">No auto-renew templates</p>
          <p className="text-xs text-muted-foreground mt-1">
            Toggle "Auto-renew" when listing a gotchi to register it here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg glass divide-y divide-border/30">
          {templates.map((t) => {
            const upfrontGhst = (() => {
              try {
                return Number(BigInt(t.initial_cost_wei || "0")) / 1e18;
              } catch {
                return 0;
              }
            })();
            const periodDays = Math.round((t.period_seconds / 86400) * 10) / 10;
            const isEnabled = t.enabled === 1;
            const lastRelist = t.last_relist_at
              ? new Date(t.last_relist_at * 1000).toLocaleString()
              : "never";
            const busyThis = pendingId === t.token_id && (setOp.step === "submitting" || setOp.step === "confirming");

            return (
              <div
                key={t.token_id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    Gotchi #{t.token_id}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {periodDays}d · {upfrontGhst < 1 ? upfrontGhst.toFixed(2) : Math.round(upfrontGhst)} GHST upfront ·
                    splits {t.split_borrower}/{t.split_owner}/{t.split_other} ·
                    {t.channelling ? " channelling on" : " channelling off"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    last relist: {lastRelist}
                    {t.last_error && (
                      <span className="text-destructive ml-2">
                        · last error: {t.last_error.slice(0, 80)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isEnabled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-500 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
                      <XCircle className="w-3 h-3" />
                      Disabled
                    </span>
                  )}

                  {isEnabled ? (
                    <button
                      type="button"
                      onClick={() => handleDisable(t)}
                      disabled={busyThis || !isOnBase}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 disabled:opacity-50 text-xs font-semibold text-destructive"
                      title="Revoke operator on-chain + disable backend template"
                    >
                      {busyThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      Disable
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReEnable(t)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 text-xs font-semibold"
                      title="Turn backend template back on (operator may need re-authorization)"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Re-enable
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        <strong>Disable</strong> revokes the GotchiCloset operator wallet's authorization on-chain
        (one tx) and turns the backend template off. <strong>Re-enable</strong> just turns the
        backend flag back on; if you previously revoked operator access you'll need to re-authorize
        the next time you list with auto-renew.
      </p>
    </div>
  );
}
