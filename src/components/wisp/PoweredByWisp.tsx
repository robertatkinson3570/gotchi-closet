import { useState } from "react";
import { WispSellDialog } from "./WispSellDialog";

/**
 * Subtle "Powered by Wisp" badge with a soft seller pitch on hover. Clicking it
 * opens the full Wisp sell dialog (explain + price + pay-in-app + manage). GotchiCloset
 * is Wisp's customer #1; this badge turns the free app into the product's showcase.
 */
export function PoweredByWisp({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`group inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-[11px] text-white/45 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white/80 ${className}`}
        title="Wisp: the soul, personality & memory engine behind this companion, as an MCP for your own project. Click to learn more."
      >
        <span>
          🔮 Powered by <span className="font-semibold text-violet-200/80">Wisp</span>
        </span>
        <span className="hidden text-white/30 group-hover:inline">· want it for your project?</span>
      </button>
      {open && <WispSellDialog onClose={() => setOpen(false)} />}
    </>
  );
}
