// src/components/megaphone/MegaphoneVideoCard.tsx
// A single published video in the Megaphone library. Neon glass shell matching the site
// (phantom-void gradient + color-matched blur orb), a native player, the caption, and the
// "grab and amplify" actions — download the MP4 and copy the caption for posting anywhere.
import { useRef, useState } from "react";
import { Download, Copy, Check, Pin, EyeOff, Eye, Trash2 } from "lucide-react";
import type { VideoPublic } from "@/lib/megaphone/types";
import { mediaUrl } from "@/lib/megaphone/api";
import { Button } from "@/ui/button";

export interface AdminActions {
  onPin: (v: VideoPublic) => void;
  onToggleHidden: (v: VideoPublic) => void;
  onDelete: (v: VideoPublic) => void;
  hidden?: boolean;
}

export function MegaphoneVideoCard({ v, admin }: { v: VideoPublic; admin?: AdminActions }) {
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = mediaUrl(v.videoUrl)!;
  const poster = mediaUrl(v.posterUrl) ?? undefined;

  async function copyCaption() {
    await navigator.clipboard.writeText(v.caption || v.title);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 ring-1 ring-primary/5 transition-shadow hover:shadow-[0_0_36px_-8px_hsl(var(--spectral)/0.5)]">
      <div className="absolute -top-20 -right-16 w-44 h-44 rounded-full blur-3xl pointer-events-none bg-[hsl(var(--spectral))]/20" />
      <div className="relative">
        <div className="relative aspect-[9/16] max-h-[520px] w-full overflow-hidden bg-black/40">
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="none"
            className="h-full w-full object-contain"
          />
          {v.pinnedPulse && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold))]/50 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--gold))] shadow-[0_0_10px_hsl(var(--gold)/0.35)]">
              <Pin className="h-3 w-3" /> on pulse
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {v.template}
            </span>
            {v.gotchiId && <span className="text-[11px] text-muted-foreground">#{v.gotchiId}</span>}
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-foreground">{v.title}</h3>
          {v.caption && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.caption}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <a href={src} download={`gotchi-${v.template.toLowerCase()}-${v.id}.mp4`}>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> MP4
              </Button>
            </a>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={copyCaption}>
              {copied ? <Check className="h-3.5 w-3.5 text-[hsl(var(--ecto))]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Caption"}
            </Button>
          </div>

          {admin && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => admin.onPin(v)}>
                <Pin className="h-3.5 w-3.5" /> {v.pinnedPulse ? "Pinned" : "Pin to Pulse"}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => admin.onToggleHidden(v)}>
                {admin.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {admin.hidden ? "Show" : "Hide"}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => admin.onDelete(v)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
