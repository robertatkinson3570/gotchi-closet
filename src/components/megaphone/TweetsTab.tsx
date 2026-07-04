// src/components/megaphone/TweetsTab.tsx
// Admin review queue for generated promo tweets. Edit inline, approve, reject, and post to X.
// Neon-spectral aesthetic matching the rest of Megaphone.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Send, Trash2, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";
import type { TweetPublic, TweetStatus } from "@/lib/megaphone/types";
import { editTweet, listTweetsAdmin, postTweet, setTweetStatus, type Sig } from "@/lib/megaphone/api";

const SOURCE_LABEL: Record<string, string> = { app: "Feature", data: "Live data", ecosystem: "Aavegotchi", builds: "Community" };
const SOURCE_COLOR: Record<string, string> = {
  app: "hsl(var(--spectral))", data: "hsl(var(--cyan))", ecosystem: "hsl(var(--ghst-pink))", builds: "hsl(var(--gold))",
};
const FILTERS: { key: TweetStatus | "all"; label: string }[] = [
  { key: "draft", label: "Drafts" },
  { key: "approved", label: "Approved" },
  { key: "posted", label: "Posted" },
  { key: "all", label: "All" },
];

function ago(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function TweetCard({ t, sig, refetch }: { t: TweetPublic; sig: Sig; refetch: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.text);
  const [busy, setBusy] = useState<string | null>(null);
  const full = t.link ? `${text}\n\n${t.link}` : text;
  const len = full.length;
  const over = len > 280;
  const color = SOURCE_COLOR[t.source] ?? "hsl(var(--spectral))";

  async function act(name: string, fn: () => Promise<void>, ok: string) {
    setBusy(name);
    try {
      await fn();
      toast({ title: ok });
      refetch();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-4 ring-1 ring-primary/5">
      <div className="pointer-events-none absolute -top-16 -right-12 h-36 w-36 rounded-full blur-3xl" style={{ background: `${color}20` }} />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: `${color}66`, color }}>
            {SOURCE_LABEL[t.source] ?? t.source}
          </span>
          <span className="text-[11px] text-muted-foreground">{ago(t.createdAt)} ago</span>
          <span className={`ml-auto text-[11px] tabular-nums ${over ? "text-[hsl(var(--red))]" : "text-muted-foreground"}`}>{len}/280</span>
        </div>

        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
        )}
        {t.link && <a href={t.link} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[hsl(var(--cyan))] hover:underline">{t.link}</a>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {t.status === "posted" ? (
            <a href={t.externalUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--cyan))] hover:underline">
              Posted to 𝕏 <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <>
              {editing ? (
                <>
                  <Button size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => act("save", () => editTweet(t.id, text, sig).then(() => setEditing(false)), "Saved")}>
                    <Check className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setText(t.text); setEditing(false); }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="gap-1.5" disabled={busy !== null || over} onClick={() => act("post", () => postTweet(t.id, sig), "Posting to X")}>
                    {busy === "post" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Post to X
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => act("reject", () => setTweetStatus(t.id, "rejected", sig), "Rejected")}>
                    <Trash2 className="h-3.5 w-3.5" /> Reject
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function TweetsTab({ sig }: { sig: Sig }) {
  const [filter, setFilter] = useState<TweetStatus | "all">("draft");
  const q = useQuery({
    queryKey: ["megaphone", "tweets", filter, sig.signedAt],
    queryFn: () => listTweetsAdmin(sig, filter === "all" ? undefined : filter),
    staleTime: 20_000,
  });
  const tweets = useMemo(() => q.data ?? [], [q.data]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f.key
                ? "border-[hsl(var(--spectral))]/60 bg-[hsl(var(--spectral))]/15 text-foreground"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">generated locally, review here, post to 𝕏</span>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading tweets…
        </div>
      ) : tweets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 py-20 text-center text-sm text-muted-foreground">
          <Sparkles className="h-8 w-8 opacity-60" />
          <p>No {filter !== "all" ? filter : ""} tweets. Run the generator: <code className="text-foreground">node tweets/generate.mjs</code></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tweets.map((t) => (
            <TweetCard key={t.id} t={t} sig={sig} refetch={() => q.refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
