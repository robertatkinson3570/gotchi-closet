import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Link2, Check } from "lucide-react";

/**
 * Shared chrome for every asset detail dialog: header (title + copy-link +
 * prev/next + close), arrow-key / Esc handling, and a backdrop. Each asset keeps
 * its own BODY and renders it as children. Portals to document.body so it never
 * fights the Explorer's conditionally-mounted market-filter slot.
 */
export function DetailDialogShell({
  title, onClose, onPrev, onNext, hasPrev, hasNext, shareUrl, widthClass = "w-[min(480px,96vw)]", children,
}: {
  title: ReactNode;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  shareUrl?: string | null;
  widthClass?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  // Arrow keys page; Esc closes. Ignored while typing in a field so bid/price
  // inputs aren't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname + shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked (private mode / no permission) */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className={`${widthClass} max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold truncate flex-1 min-w-0">{title}</div>
          {shareUrl && (
            <button onClick={copyLink} title="Copy link to this item" className="p-1.5 rounded hover:bg-muted/50 shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
            </button>
          )}
          {(onPrev || onNext) && (
            <div className="flex items-center shrink-0">
              <button onClick={onPrev} disabled={!hasPrev} title="Previous (left arrow)" className="p-1.5 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={onNext} disabled={!hasNext} title="Next (right arrow)" className="p-1.5 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
          <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded hover:bg-muted/50 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>,
    document.body
  );
}
