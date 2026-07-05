import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  RotateCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Coins,
  Plus,
} from "lucide-react";
import {
  useAutoRenewTemplates,
  setTemplateEnabled,
  type AutoRenewTemplate,
} from "@/hooks/useAutoRenewTemplates";
import { useSetLendingOperator, useTransferGhst } from "@/hooks/useLendingTx";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";
import { env } from "@/lib/env";
import { ghstToWei } from "@/lib/lending/transform";
import { SUBSCRIPTION_TIERS } from "./ListLendingModal";

export function AutoRenewTab() {
  const { address, isConnected } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const { templates, loading, error, reload } = useAutoRenewTemplates(address);
  const setOp = useSetLendingOperator();
  const subPay = useTransferGhst();
  const [pendingId, setPendingId] = useState<number | null>(null);
  // Token currently being extended + months chosen for it
  const [extendFor, setExtendFor] = useState<{ tokenId: number; months: number } | null>(null);

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

  // After a successful subscription extension payment, register it server-side.
  useEffect(() => {
    if (subPay.step !== "success" || !subPay.txHash || !extendFor || !address) return;
    if (!env.autoRenewApiUrl) return;
    const { tokenId, months } = extendFor;
    fetch(`${env.autoRenewApiUrl}/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId, owner: address, months, paymentTxHash: subPay.txHash }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`);
        }
        toast({
          title: "Subscription extended",
          description: `#${tokenId}: +${months * 30} days`,
        });
        reload();
      })
      .catch((err: any) => {
        toast({
          title: "Extension recording failed",
          description: err?.message ?? String(err),
          variant: "destructive",
        });
      })
      .finally(() => {
        setExtendFor(null);
        subPay.reset();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subPay.step, subPay.txHash]);

  const handleExtend = (tokenId: number, months: number) => {
    if (!env.autoRenewOperator) return;
    const tier = SUBSCRIPTION_TIERS.find((t) => t.months === months);
    if (!tier) return;
    setExtendFor({ tokenId, months });
    const wei = ghstToWei(tier.priceGhst);
    subPay.send(env.autoRenewOperator as `0x${string}`, wei);
  };

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

  const handleDisableAll = async () => {
    const enabled = templates.filter((t) => t.enabled === 1);
    if (enabled.length === 0) return;
    if (!confirm(
      `Disable auto-renew on all ${enabled.length} active templates?\n\n` +
      `This flips the backend off for all of them. ` +
      `On-chain operator authorization for each gotchi remains until you list one with auto-renew on or revoke it manually.`
    )) return;
    let failed = 0;
    for (const t of enabled) {
      try {
        await setTemplateEnabled(t.token_id, false);
      } catch {
        failed += 1;
      }
    }
    toast({
      title: failed > 0 ? "Partial disable" : "All disabled",
      description: failed > 0
        ? `${enabled.length - failed} disabled, ${failed} failed`
        : `${enabled.length} templates disabled`,
      variant: failed > 0 ? "destructive" : undefined,
    });
    reload();
  };

  const enabledCount = templates.filter((t) => t.enabled === 1).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Templates registered with the GotchiCloset auto-renew backend. Subscription billed
          off-chain in GHST (1 GHST/30 days, multi-month discounts). Cron stops the moment
          your subscription expires, never renews past paid term.
        </p>
        <div className="flex items-center gap-1.5">
          {enabledCount > 0 && (
            <button
              type="button"
              onClick={handleDisableAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded text-xs border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold"
              title="Disable auto-renew on all templates (backend off; on-chain operator stays authorized)"
            >
              <XCircle className="w-3.5 h-3.5" />
              Disable all ({enabledCount})
            </button>
          )}
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

            const subActive = t.subscriptionActive === true;
            const daysLeft = t.daysLeft ?? 0;
            const expiresIso =
              t.subscription?.expires_at
                ? new Date(t.subscription.expires_at * 1000).toLocaleDateString()
                : null;
            const subBusy =
              extendFor?.tokenId === t.token_id &&
              (subPay.step === "submitting" || subPay.step === "confirming");
            const subSoon = subActive && daysLeft <= 5;

            return (
              <div
                key={t.token_id}
                className="px-3 py-2 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Gotchi #{t.token_id}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {periodDays}d · {upfrontGhst < 1 ? upfrontGhst.toFixed(2) : Math.round(upfrontGhst)} GHST upfront ·
                      lender/borrower {t.split_owner}/{t.split_borrower} ·
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
                    {subActive ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                          subSoon ? "text-amber-500" : "text-green-500"
                        }`}
                        title={expiresIso ? `Expires ${expiresIso}` : undefined}
                        data-testid={`sub-status-${t.token_id}`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {daysLeft}d left
                      </span>
                    ) : t.subscription ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-destructive font-semibold"
                        title={expiresIso ? `Expired ${expiresIso}` : undefined}
                        data-testid={`sub-status-${t.token_id}`}
                      >
                        <XCircle className="w-3 h-3" />
                        Expired
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-semibold"
                        data-testid={`sub-status-${t.token_id}`}
                      >
                        <Coins className="w-3 h-3" />
                        Unpaid
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

                {/* Subscription extend bar — visible when active+expiring soon, expired, or unpaid */}
                {(!subActive || subSoon) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground inline-flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      {!t.subscription
                        ? "Pay subscription:"
                        : subActive
                          ? "Expiring soon, extend:"
                          : "Renew:"}
                    </span>
                    {SUBSCRIPTION_TIERS.map((tier) => (
                      <button
                        key={tier.months}
                        type="button"
                        onClick={() => handleExtend(t.token_id, tier.months)}
                        disabled={subBusy || !isOnBase}
                        data-testid={`sub-extend-${t.token_id}-${tier.months}`}
                        className="inline-flex items-center gap-1 px-2 h-6 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary text-[10px] font-semibold disabled:opacity-50"
                        title={`Pay ${tier.priceGhst} GHST for ${tier.months * 30} days`}
                      >
                        {subBusy && extendFor?.tokenId === t.token_id && extendFor.months === tier.months ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Plus className="w-2.5 h-2.5" />
                        )}
                        {tier.priceGhst} GHST · {tier.months}mo
                      </button>
                    ))}
                  </div>
                )}
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
