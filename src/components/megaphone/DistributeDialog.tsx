// src/components/megaphone/DistributeDialog.tsx
// Admin per-video channel picker: choose which connected Postiz channels to post this video
// to, right now. Channels it was already sent to are shown as done (the ledger blocks any
// repeat server-side regardless). Works whenever Postiz is configured, even with auto-distribute off.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import type { VideoPublic } from "@/lib/megaphone/types";
import { distributeNow, listPostizChannels, type PostizChannel, type Sig } from "@/lib/megaphone/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

const PROVIDER_LABEL: Record<string, string> = {
  x: "𝕏 (Twitter)", twitter: "𝕏 (Twitter)", telegram: "Telegram", youtube: "YouTube", discord: "Discord",
};

// Providers Megaphone can post to with no extra per-channel config (matches the server).
const SUPPORTED = new Set(["x", "twitter", "telegram", "youtube"]);

export function DistributeDialog({
  video,
  sig,
  onClose,
  onDone,
}: {
  video: VideoPublic;
  sig: Sig;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [channels, setChannels] = useState<PostizChannel[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const alreadySent = useMemo(
    () => new Set(video.distributions.map((d) => d.integrationId)),
    [video.distributions],
  );

  useEffect(() => {
    listPostizChannels(sig)
      .then((r) => {
        setConfigured(r.configured);
        setChannels(r.integrations);
        // Preselect supported channels not yet sent.
        setSel(new Set(r.integrations.filter((c) => SUPPORTED.has(c.provider.toLowerCase()) && !alreadySent.has(c.id)).map((c) => c.id)));
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, [sig, alreadySent]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function post() {
    const ids = [...sel].filter((id) => !alreadySent.has(id));
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const r = await distributeNow(video.id, ids, sig);
      toast({ title: "Sent to Postiz", description: `${r.posted} posting, ${r.skipped} skipped, ${r.failed} failed` });
      onDone();
      onClose();
    } catch (err) {
      toast({ title: "Distribute failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const selectable = channels.filter((c) => !alreadySent.has(c.id));
  const canPost = selectable.some((c) => sel.has(c.id)) && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-background shadow-[0_0_60px_-12px_hsl(var(--spectral)/0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 p-5">
          <h2 className="bg-gradient-to-r from-[hsl(var(--spectral))] via-[hsl(var(--ghst-pink))] to-[hsl(var(--cyan))] bg-clip-text text-lg font-bold text-transparent">
            Distribute
          </h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{video.title}</p>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading channels…
            </div>
          ) : !configured ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
              Postiz isn't configured yet. Set POSTIZ_URL and POSTIZ_API_KEY, then redeploy.
            </p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connected channels found in Postiz.</p>
          ) : (
            <div className="space-y-2">
              {channels.map((c) => {
                const sent = alreadySent.has(c.id);
                const supported = SUPPORTED.has(c.provider.toLowerCase());
                const disabled = sent || !supported;
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                      disabled ? "border-white/5 opacity-50" : "cursor-pointer border-white/10 hover:border-[hsl(var(--spectral))]/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[hsl(var(--spectral))]"
                      disabled={disabled}
                      checked={sent || (supported && sel.has(c.id))}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{PROVIDER_LABEL[c.provider.toLowerCase()] ?? c.provider}</span>
                      <span className="ml-2 text-muted-foreground">{c.name}</span>
                    </span>
                    {sent ? (
                      <span className="text-[11px] uppercase tracking-wide text-[hsl(var(--cyan))]">sent</span>
                    ) : !supported ? (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">soon</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 p-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canPost} onClick={post} className="gap-1.5">
            <Send className="h-4 w-4" /> {busy ? "Sending…" : "Post now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
