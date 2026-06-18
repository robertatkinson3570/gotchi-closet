import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { getSoulDepth, type SoulDepthData } from "@/lib/companion/soulApi";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SealBadge({ status }: { status: SoulDepthData["sealStatus"] }) {
  if (status === "sealed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
        ✓ Sealed on Base
      </span>
    );
  }
  if (status === "unsealed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400 ring-1 ring-yellow-500/30">
        Unsealed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/35 ring-1 ring-white/10">
      Seal coming soon
    </span>
  );
}

function SignalBar({
  label,
  value,
  max,
  delay,
}: {
  label: string;
  value: number;
  max: number;
  delay: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-right text-[10px] text-white/45">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={
            prefersReduced ? { duration: 0 } : { duration: 0.7, delay, ease: "easeOut" }
          }
        />
      </div>
      <span className="w-5 text-left text-[10px] tabular-nums text-white/35">
        {Math.round(value)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The certificate card (also the export target)
// ---------------------------------------------------------------------------

function CertCard({
  data,
  cardRef,
}: {
  data: SoulDepthData;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const hasPastLives = data.pastLives.length > 0;

  return (
    <div
      ref={cardRef}
      className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#1a0a2e] via-[#0d1a2e] to-[#0a1a1a] p-5 shadow-2xl shadow-violet-900/40"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-cyan-600/10 blur-3xl" />

      {/* Header */}
      <div className="relative flex items-start gap-3">
        {/* Sprite */}
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <GotchiSvgById id={data.tokenId} className="h-full w-full object-contain" />
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400/70">
            Soul Certificate
          </p>
          <h2 className="mt-0.5 truncate text-lg font-bold text-white">
            {data.name || `Gotchi #${data.tokenId}`}
          </h2>
          <p className="text-[11px] text-white/40">#{data.tokenId}</p>
          <div className="mt-1.5">
            <SealBadge status={data.sealStatus} />
          </div>
        </div>
      </div>

      {/* Soul level + score */}
      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Soul Level
          </p>
          <p className="mt-0.5 bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-3xl font-black text-transparent">
            {data.level}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Depth
          </p>
          <p className="text-2xl font-bold text-white">
            {Math.round(data.depth)}
            <span className="text-sm font-normal text-white/30">/100</span>
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, data.depth)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>

      {/* Signal breakdown */}
      <div className="relative mt-4 flex flex-col gap-1.5">
        <SignalBar label="Kinship/XP"  value={data.breakdown.kinshipXp}  max={35} delay={0.1} />
        <SignalBar label="Consistency" value={data.breakdown.consistency} max={30} delay={0.2} />
        <SignalBar label="Soul age"    value={data.breakdown.soulAge}     max={25} delay={0.3} />
        <SignalBar label="Memories"    value={data.breakdown.memory}      max={10} delay={0.4} />
      </div>

      {/* Stats row */}
      <div className="relative mt-3 flex justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-[10px]">
        <div className="text-center">
          <p className="text-white/35">Soul age</p>
          <p className="font-semibold text-white/70">{data.soulAgeDays}d</p>
        </div>
        <div className="text-center">
          <p className="text-white/35">Streak</p>
          <p className="font-semibold text-white/70">🔥 {data.streak}d</p>
        </div>
        <div className="text-center">
          <p className="text-white/35">Memories</p>
          <p className="font-semibold text-white/70">{data.memories}</p>
        </div>
        <div className="text-center">
          <p className="text-white/35">Past lives</p>
          <p className="font-semibold text-white/70">{data.pastLives.length}</p>
        </div>
      </div>

      {/* Past Lives */}
      <div className="relative mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60">
          Past Lives
        </p>
        {hasPastLives ? (
          <ul className="mt-2 flex flex-col gap-2">
            {data.pastLives.map((echo, i) => (
              <li
                key={i}
                className="rounded-lg border border-violet-800/30 bg-violet-950/40 px-3 py-2"
              >
                <p className="text-[9px] font-semibold uppercase tracking-widest text-violet-400/50">
                  {echo.eraHint}
                </p>
                <p className="mt-0.5 text-[11px] italic text-white/55">
                  &ldquo;{echo.fragment}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] italic text-white/30">
            No past lives yet — this soul has only known one keeper.
          </p>
        )}
      </div>

      {/* Watermark */}
      <p className="relative mt-4 text-center text-[9px] text-white/15">
        gotchi-closet.xyz · Soul Certificate
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

interface SoulCertificateProps {
  tokenId: string;
  onClose: () => void;
}

interface SealAttestation {
  payload: {
    tokenId: string;
    soulHash: string;
    depthBips: number;
    soulAgeDays: number;
    nonce: string;
  };
  attestorSig: string;
  contract: string;
}

export function SoulCertificate({ tokenId, onClose }: SoulCertificateProps) {
  const [data, setData] = useState<SoulDepthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [sealAttestation, setSealAttestation] = useState<SealAttestation | null>(null);
  const [sealError, setSealError] = useState<string | null>(null);
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const cardRef = (el: HTMLDivElement | null) => { cardElRef.current = el; };

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setLoading(true);
    setError(false);
    getSoulDepth(tokenId)
      .then((d) => {
        if (d) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tokenId]);

  async function handleExport() {
    if (!cardElRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardElRef.current, { cacheBust: true });
      const link = document.createElement("a");
      link.download = `soul-certificate-${tokenId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("[SoulCertificate] export failed", e);
    } finally {
      setExporting(false);
    }
  }

  async function handleSeal() {
    if (!data || data.sealStatus !== "unsealed") return;
    setSealing(true);
    setSealError(null);
    setSealAttestation(null);
    try {
      const base = (import.meta as { env: Record<string, string> }).env.VITE_COMPANION_API_URL || "";
      const resp = await fetch(`${base}/api/soul/${tokenId}/seal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: "" }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        setSealError(body.error ?? `Request failed (${resp.status})`);
        return;
      }
      const result = await resp.json() as SealAttestation;
      setSealAttestation(result);
    } catch (e) {
      setSealError("Network error — please try again");
      console.error("[SoulCertificate] seal failed", e);
    } finally {
      setSealing(false);
    }
  }

  async function handleCopyVerifyUrl() {
    const url = `${window.location.origin}/soul/verify/${tokenId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        key="sc-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        initial={prefersReduced ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleBackdrop}
      >
        <motion.div
          key="sc-panel"
          className="flex w-full max-w-sm flex-col gap-3"
          initial={prefersReduced ? {} : { opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={prefersReduced ? {} : { opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* Close button row */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/60 hover:bg-white/20 hover:text-white transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-950/30 p-6 text-center text-sm text-red-400">
              Could not load soul data for #{tokenId}.
            </div>
          )}

          {/* Certificate card */}
          {!loading && data && <CertCard data={data} cardRef={cardRef} />}

          {/* Action buttons */}
          {!loading && data && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex-1 rounded-xl bg-violet-600 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "Export PNG"}
                </button>
                <button
                  onClick={handleCopyVerifyUrl}
                  className="flex-1 rounded-xl border border-white/15 bg-white/8 py-2 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                >
                  {copied ? "Copied!" : "Copy Verify Link"}
                </button>
              </div>

              {/* Seal on Base button */}
              {data.sealStatus === "unconfigured" && (
                <button
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-white/4 py-2 text-[12px] font-semibold text-white/30 cursor-not-allowed"
                >
                  Seal: coming soon
                </button>
              )}
              {data.sealStatus === "unsealed" && !sealAttestation && (
                <button
                  onClick={handleSeal}
                  disabled={sealing}
                  className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {sealing ? "Requesting attestation…" : "Seal on Base"}
                </button>
              )}
              {data.sealStatus === "sealed" && (
                <button
                  disabled
                  className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/8 py-2 text-[12px] font-semibold text-emerald-400/50 cursor-not-allowed"
                >
                  Already sealed
                </button>
              )}

              {/* Seal error */}
              {sealError && (
                <p className="text-center text-[11px] text-red-400">{sealError}</p>
              )}

              {/* Attestation ready — display sig + contract */}
              {sealAttestation && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-3 py-3 text-[11px] flex flex-col gap-1.5">
                  <p className="font-semibold text-emerald-300">
                    Attestation ready — submit in your wallet
                  </p>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white/35">Contract</span>
                    <span className="font-mono text-white/55 break-all">
                      {sealAttestation.contract}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white/35">Attestor sig</span>
                    <span className="font-mono text-white/55 break-all">
                      {sealAttestation.attestorSig.slice(0, 20)}…{sealAttestation.attestorSig.slice(-10)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
