import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { Loader2, Megaphone as MegaphoneIcon, Plus, ShieldCheck } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";
import { adminMessage } from "@/lib/megaphone/auth";
import { TEMPLATES, type Template } from "@/lib/megaphone/types";
import {
  checkAdmin,
  getPostizStatus,
  deleteVideo as apiDelete,
  listAllAdmin,
  listVideos,
  pinPulse as apiPin,
  setStatus as apiSetStatus,
  type Sig,
} from "@/lib/megaphone/api";
import type { VideoPublic } from "@/lib/megaphone/types";
import { MegaphoneMark } from "@/components/megaphone/MegaphoneMark";
import { MegaphoneVideoCard } from "@/components/megaphone/MegaphoneVideoCard";
import { PublishDialog } from "@/components/megaphone/PublishDialog";
import { DistributeDialog } from "@/components/megaphone/DistributeDialog";

const FILTERS: (Template | "All")[] = ["All", ...TEMPLATES];

export default function MegaphonePage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [admin, setAdmin] = useState(false);
  const [manage, setManage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [distributeTarget, setDistributeTarget] = useState<VideoPublic | null>(null);
  const [filter, setFilter] = useState<Template | "All">("All");

  useEffect(() => {
    if (address) checkAdmin(address).then(setAdmin);
    else { setAdmin(false); setManage(false); }
  }, [address]);

  const postizQ = useQuery({ queryKey: ["megaphone", "postiz-status"], queryFn: getPostizStatus, enabled: admin, staleTime: 60_000 });

  const publicQ = useQuery({
    queryKey: ["megaphone", "public"],
    queryFn: () => listVideos(),
    staleTime: 60_000,
    enabled: !manage,
  });

  const [adminSig, setAdminSig] = useState<Sig | null>(null);
  const adminQ = useQuery({
    queryKey: ["megaphone", "admin", adminSig?.signedAt],
    queryFn: () => listAllAdmin(adminSig!),
    enabled: manage && !!adminSig,
    staleTime: 30_000,
  });

  async function enterManage() {
    if (!address) return;
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: adminMessage(address, signedAt) });
      setAdminSig({ wallet: address, signature, signedAt });
      setManage(true);
    } catch {
      /* user rejected */
    }
  }

  async function adminAction(fn: (sig: Sig) => Promise<void>, okMsg: string) {
    if (!adminSig) return;
    try {
      await fn(adminSig);
      toast({ title: okMsg });
      adminQ.refetch();
    } catch (err) {
      toast({ title: "Action failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  const videos = manage ? adminQ.data : publicQ.data;
  const shown = useMemo(
    () => (videos ?? []).filter((v) => filter === "All" || v.template === filter),
    [videos, filter]
  );
  const loading = manage ? adminQ.isLoading : publicQ.isLoading;

  return (
    <div className="relative container mx-auto max-w-[1200px] px-4 py-6">
      <Seo
        title="Megaphone · GotchiCloset content engine"
        description="Auto-generated Aavegotchi videos from live on-chain data. Grab a clip, post it anywhere. A functional prototype of a community content + distribution engine."
        canonical={siteUrl("/megaphone")}
      />

      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[hsl(var(--spectral))]/15 blur-[120px]" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[hsl(var(--ghst-pink))]/12 blur-[130px]" />
        <div className="absolute left-1/3 top-24 h-64 w-64 rounded-full bg-[hsl(var(--cyan))]/10 blur-[110px]" />
      </div>

      {/* Hero */}
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <MegaphoneMark size={128} className="shrink-0" />
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--gold))] shadow-[0_0_16px_hsl(var(--gold)/0.28)]">
            ⚡ Functional Prototype
          </span>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-[hsl(var(--spectral))] via-[hsl(var(--ghst-pink))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">
              Megaphone
            </span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Aavegotchi content, auto-generated from live on-chain data or uploaded by you, then queued out to
            X, Telegram and YouTube. Contributors and events drop clips in, the engine handles distribution to the accounts we choose. Near-zero cost.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f
                  ? "border-[hsl(var(--spectral))]/60 bg-[hsl(var(--spectral))]/15 text-foreground"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {admin && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                postizQ.data?.configured
                  ? "border-[hsl(var(--ecto))]/40 bg-[hsl(var(--ecto))]/10 text-[hsl(var(--ecto))]"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
              title={
                postizQ.data?.configured
                  ? postizQ.data.auto
                    ? "Connected. New videos auto-post to the allowlisted channels."
                    : "Connected. Use Distribute to post manually (auto-on-publish is off)."
                  : "Set POSTIZ_URL + POSTIZ_API_KEY to enable"
              }
            >
              <span className={`h-1.5 w-1.5 rounded-full ${postizQ.data?.configured ? "bg-[hsl(var(--ecto))]" : "bg-amber-400"}`} />
              Postiz {postizQ.data?.configured ? "connected" : "not configured"}
              {postizQ.data?.configured && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                    postizQ.data.auto ? "bg-[hsl(var(--ecto))]/20 text-[hsl(var(--ecto))]" : "bg-white/10 text-muted-foreground"
                  }`}
                >
                  auto {postizQ.data.auto ? "on" : "off"}
                </span>
              )}
            </span>
          )}
          {admin && !manage && (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={enterManage}>
              <ShieldCheck className="h-4 w-4" /> Manage
            </Button>
          )}
          {admin && manage && (
            <Button size="sm" variant="ghost" onClick={() => setManage(false)}>Done</Button>
          )}
          {admin && (
            <Button size="sm" className="gap-1.5" onClick={() => setPublishing(true)}>
              <Plus className="h-4 w-4" /> Publish
            </Button>
          )}
        </div>
      </div>

      {!isConnected && (
        <p className="mt-4 text-xs text-muted-foreground">Connect an admin wallet to publish or manage.</p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading videos…
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 py-24 text-center text-sm text-muted-foreground">
          <MegaphoneIcon className="h-8 w-8 opacity-60" />
          <p>No videos yet{filter !== "All" ? ` in ${filter}` : ""}. {admin ? "Hit Publish to drop the first one." : "Check back soon."}</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((v) => (
            <MegaphoneVideoCard
              key={v.id}
              v={v}
              admin={
                manage
                  ? {
                      hidden: false,
                      onDistribute: (x: VideoPublic) => setDistributeTarget(x),
                      onPin: (x: VideoPublic) => adminAction((s) => apiPin(x.id, s), "Pinned to Pulse"),
                      onToggleHidden: (x: VideoPublic) => adminAction((s) => apiSetStatus(x.id, "hidden", s), "Hidden"),
                      onDelete: (x: VideoPublic) => {
                        if (confirm(`Delete "${x.title}"? This removes the file.`)) {
                          adminAction((s) => apiDelete(x.id, s), "Deleted");
                        }
                      },
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {publishing && (
        <PublishDialog
          onClose={() => setPublishing(false)}
          onPublished={() => {
            publicQ.refetch();
            if (manage) adminQ.refetch();
          }}
        />
      )}

      {distributeTarget && adminSig && (
        <DistributeDialog
          video={distributeTarget}
          sig={adminSig}
          onClose={() => setDistributeTarget(null)}
          onDone={() => adminQ.refetch()}
        />
      )}
    </div>
  );
}
