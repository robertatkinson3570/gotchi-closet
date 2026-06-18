import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Search, X } from "lucide-react";
import { KB_SECTIONS } from "@/lib/knowledgeBase";

type TriggerVariant = "hero" | "nav" | "link";

/**
 * Self-contained "Guide" trigger + knowledge-base modal. Drop it anywhere
 * (landing page, header) — it owns its own open state. Content comes from the
 * canonical KB module so it always matches what the companion knows.
 */
export function KnowledgeBaseButton({ variant = "link", className }: { variant?: TriggerVariant; className?: string }) {
  const [open, setOpen] = useState(false);

  const triggerCls =
    className ??
    (variant === "hero"
      ? "inline-flex items-center gap-2 h-11 px-5 rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-sm font-semibold transition-colors"
      : variant === "nav"
        ? "inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        : "inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerCls} title="Guide — how GotchiCloset & Aavegotchi work">
        <BookOpen className="w-4 h-4" />
        {variant !== "nav" && <span>Guide</span>}
      </button>
      {open && <KnowledgeBaseModal onClose={() => setOpen(false)} />}
    </>
  );
}

function KnowledgeBaseModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return KB_SECTIONS.map((s) => ({ ...s, items: s.items }));
    return KB_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => `${i.heading} ${i.body} ${(i.tags ?? []).join(" ")}`.toLowerCase().includes(q)),
    })).filter((s) => s.items.length > 0);
  }, [q]);

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className="w-[min(960px,98vw)] h-[min(88vh,800px)] flex flex-col rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative shrink-0 border-b border-border/60 px-4 sm:px-5 py-3.5 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-fuchsia-500/10 to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary shrink-0"><BookOpen className="w-5 h-5" /></span>
              <div className="min-w-0">
                <div className="text-base font-bold tracking-tight">GotchiCloset Guide</div>
                <div className="text-[11px] text-muted-foreground truncate">Every feature, plus Aavegotchi essentials</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative mt-3 flex items-center gap-2 rounded-lg bg-background/70 border border-border/50 px-2.5 h-9">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the guide…" className="flex-1 bg-transparent outline-none text-sm" autoFocus />
            {query && <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* TOC */}
          {!q && (
            <nav className="hidden md:block w-52 shrink-0 border-r border-border/40 overflow-y-auto py-3 px-2">
              {KB_SECTIONS.map((s) => (
                <button key={s.id} onClick={() => scrollTo(s.id)} className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Content */}
          <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-7">
            {sections.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">No matches for “{query}”.</div>
            ) : (
              sections.map((s) => (
                <section key={s.id} ref={(el) => { sectionRefs.current[s.id] = el; }} className="scroll-mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl leading-none">{s.emoji}</span>
                    <h3 className="text-lg font-bold tracking-tight">{s.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{s.blurb}</p>
                  <div className="space-y-2.5">
                    {s.items.map((it) => (
                      <div key={it.heading} className="rounded-xl border border-border/40 bg-gradient-to-b from-muted/10 to-muted/25 p-3">
                        <div className="text-sm font-semibold mb-0.5">{it.heading}</div>
                        <div className="text-[13px] text-muted-foreground leading-relaxed">{it.body}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
            <div className="pt-2 text-center text-[11px] text-muted-foreground">
              Community-built · non-custodial · runs on Base. Not affiliated with Pixelcraft/Aavegotchi.
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
