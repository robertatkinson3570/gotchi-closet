// src/components/megaphone/PulseVideoHero.tsx
// The weekly recap video, embedded at the top of /pulse. Renders nothing until an admin
// pins one in the Megaphone, so the page degrades cleanly when there's no video. Carries a
// "functional prototype" badge and a link to the full Megaphone library.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { mediaUrl, pulseHero } from "@/lib/megaphone/api";

export function PulseVideoHero() {
  const { data } = useQuery({
    queryKey: ["megaphone", "pulse-hero"],
    queryFn: pulseHero,
    staleTime: 60_000,
  });
  if (!data) return null;

  const poster = mediaUrl(data.posterUrl) ?? undefined;
  // No poster image: load the frame at 0.5s as the thumbnail instead of a black box.
  const src = poster ? mediaUrl(data.videoUrl)! : `${mediaUrl(data.videoUrl)!}#t=0.5`;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 ring-1 ring-primary/5">
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[hsl(var(--spectral))]/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="mx-auto w-full max-w-[220px] shrink-0 overflow-hidden rounded-xl bg-black/40 shadow-[0_0_30px_-8px_hsl(var(--spectral)/0.5)]">
          <video
            src={src}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--gold))]">
              ⚡ Prototype
            </span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Weekly recap</span>
          </div>
          <h2 className="mt-2 text-lg font-bold">
            <span className="bg-gradient-to-r from-[hsl(var(--spectral))] via-[hsl(var(--ghst-pink))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">
              {data.title}
            </span>
          </h2>
          {data.caption && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{data.caption}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Auto-generated from this week's on-chain data at near-zero cost.
          </p>
          <Link
            to="/megaphone"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--cyan))] hover:underline"
          >
            More videos in the Megaphone <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
