import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { getSoulDepth, type SoulDepthData } from "@/lib/companion/soulApi";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { env } from "@/lib/env";

// ABI for SoulSeal.seal(...) — the owner submits this from their own wallet to
// anchor the soul on Base. The contract verifies the attestor signature AND that
// msg.sender == ownerOf(tokenId), so only the real owner can complete a seal.
const SEAL_ABI = [
  {
    type: "function",
    name: "seal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "soulHash", type: "bytes32" },
      { name: "depthBips", type: "uint16" },
      { name: "soulAgeDays", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "attestorSig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// Seal flow phases, in order. Drives the step indicator + button label so the
// user always understands exactly where they are.
type SealPhase = "idle" | "attesting" | "confirm" | "mining" | "done";
const SEAL_PHASES: SealPhase[] = ["idle", "attesting", "confirm", "mining", "done"];

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
      Sealing coming soon
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
  const [sealPhase, setSealPhase] = useState<SealPhase>("idle");
  const [sealTxHash, setSealTxHash] = useState<string | null>(null);
  const [sealError, setSealError] = useState<string | null>(null);
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const cardRef = (el: HTMLDivElement | null) => { cardElRef.current = el; };

  // Wallet plumbing for the on-chain seal step.
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  // Step indicator: ✓ done · • active · ○ pending.
  const sealPhaseIdx = SEAL_PHASES.indexOf(sealPhase);
  const stepMark = (need: SealPhase) => {
    const i = SEAL_PHASES.indexOf(need);
    if (sealPhaseIdx > i) return "✓";
    if (sealPhaseIdx === i) return "•";
    return "○";
  };

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
    // Allow both first-seal ("unsealed") and re-seal ("sealed") — the contract
    // and server both permit overwriting latest[tokenId] with a fresh snapshot.
    if (!data || (data.sealStatus !== "unsealed" && data.sealStatus !== "sealed")) return;
    if (!isConnected || !address) {
      setSealError("Connect your wallet to seal this soul.");
      return;
    }
    setSealing(true);
    setSealError(null);
    setSealTxHash(null);
    setSealPhase("idle");
    try {
      // 1. Ask the server attestor to sign the EIP-712 seal payload.
      setSealPhase("attesting");
      const apiBase = env.companionApiUrl || "";
      const resp = await fetch(`${apiBase}/api/soul/${tokenId}/seal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        setSealError(body.error ?? `Attestation failed (${resp.status})`);
        setSealPhase("idle");
        return;
      }
      const att = (await resp.json()) as SealAttestation;

      // 2. Owner submits seal() from their own wallet (pays gas). Passing chainId
      //    makes the wallet switch to Base if it isn't already. The contract
      //    re-checks ownerOf(tokenId) == msg.sender, so only the owner can seal.
      setSealPhase("confirm");
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: att.contract as `0x${string}`,
        abi: SEAL_ABI,
        functionName: "seal",
        args: [
          BigInt(att.payload.tokenId),
          att.payload.soulHash as `0x${string}`,
          att.payload.depthBips,
          att.payload.soulAgeDays,
          BigInt(att.payload.nonce),
          att.attestorSig as `0x${string}`,
        ],
      });
      setSealTxHash(hash);

      // 3. Wait for the tx to actually mine before claiming success. A missing
      //    client must be a hard error (never a silent "done"); a reverted tx
      //    must surface as failure. The tx hash is already in state either way,
      //    so the user keeps the Basescan link to check.
      setSealPhase("mining");
      if (!publicClient) {
        throw new Error("Could not reach Base to confirm. Check the transaction on Basescan.");
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status === "reverted") {
        throw new Error("The seal transaction reverted on-chain. You may not be the current owner of this gotchi.");
      }
      setSealPhase("done");
      setData((d) => (d ? { ...d, sealStatus: "sealed" } : d));
      getSoulDepth(tokenId)
        .then((d) => { if (d) setData(d); })
        .catch(() => { /* optimistic state already applied */ });
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      const raw = err?.shortMessage || err?.message || "";
      const lc = raw.toLowerCase();
      let msg: string;
      if (lc.includes("user rejected") || lc.includes("rejected the request") || lc.includes("denied")) {
        msg = "You cancelled the request in your wallet.";
      } else if (lc.includes("chain mismatch") || lc.includes("4902") ||
                 (lc.includes("chain") && lc.includes("switch")) || lc.includes("unsupported chain")) {
        msg = "Switch your wallet to the Base network, then try again.";
      } else {
        msg = raw || "Sealing failed — please try again.";
      }
      setSealError(msg);
      setSealPhase("idle");
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
        className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
        initial={prefersReduced ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleBackdrop}
      >
        <motion.div
          key="sc-panel"
          className="flex max-h-[88vh] w-full max-w-sm flex-col gap-3 overflow-y-auto"
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

              {/* ── Seal on Base ──────────────────────────────────────────── */}
              {data.sealStatus === "unconfigured" && (
                <button
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-white/4 py-2 text-[12px] font-semibold text-white/30 cursor-not-allowed"
                >
                  Sealing coming soon
                </button>
              )}

              {data.sealStatus !== "unconfigured" &&
                (() => {
                  const inFlight =
                    sealPhase === "attesting" ||
                    sealPhase === "confirm" ||
                    sealPhase === "mining";
                  const sealed = data.sealStatus === "sealed" || sealPhase === "done";
                  const isReseal = data.sealStatus === "sealed";

                  // Sealed and not mid-flow → success card with a quiet re-seal.
                  if (sealed && !inFlight) {
                    return (
                      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-center">
                        <p className="text-[12px] font-semibold text-emerald-300">✓ Sealed on Base</p>
                        <p className="text-[10px] text-white/50">
                          A snapshot of this soul&rsquo;s depth &amp; fingerprint is permanently
                          anchored on-chain.
                        </p>
                        <a
                          href={sealTxHash ? `https://basescan.org/tx/${sealTxHash}` : `/soul/verify/${tokenId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-cyan-400 underline underline-offset-2"
                        >
                          {sealTxHash ? "View transaction on Basescan ↗" : "View on-chain proof ↗"}
                        </a>
                        <button
                          onClick={handleSeal}
                          disabled={sealing || !isConnected}
                          className="mt-1 rounded-lg border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50"
                        >
                          Re-seal to refresh
                        </button>
                        {!isConnected && (
                          <p className="text-[10px] text-yellow-400/80">Connect your wallet to re-seal.</p>
                        )}
                        {sealError && <p className="text-[11px] text-red-400">{sealError}</p>}
                      </div>
                    );
                  }

                  // First seal, or a seal/re-seal in flight → explainer + step trail.
                  return (
                    <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3">
                      <p className="text-[11px] font-semibold text-emerald-300">
                        🔏 {isReseal ? "Re-seal this soul on Base" : "Seal this soul onto Base"}
                      </p>
                      <p className="text-[10px] leading-relaxed text-white/55">
                        {isReseal ? (
                          <>
                            Records a fresh snapshot of your soul&rsquo;s current depth on Base. You
                            approve it in your wallet and pay a small gas fee (usually a few cents).
                          </>
                        ) : (
                          <>
                            Stamps a snapshot of this soul&rsquo;s depth &amp; fingerprint onto the Base
                            blockchain as on-chain proof of your bond &mdash;{" "}
                            <span className="text-white/80">owner-only and permanent</span>. You approve
                            it in your wallet on Base and pay a small gas fee (usually a few cents). Your
                            soul keeps growing afterward; the seal records today&rsquo;s depth, so you can
                            re-seal later to capture a newer one.
                          </>
                        )}
                      </p>

                      {!isConnected && (
                        <p className="text-[10px] font-medium text-yellow-400/90">
                          Connect your wallet to seal.
                        </p>
                      )}
                      {isConnected && !isOnBase && sealPhase === "idle" && (
                        <p className="text-[10px] text-white/45">
                          You&rsquo;re not on Base — your wallet will switch when you confirm.
                        </p>
                      )}

                      <button
                        onClick={handleSeal}
                        disabled={sealing || !isConnected}
                        className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-2 text-[12px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        {sealPhase === "attesting" && "Preparing attestation…"}
                        {sealPhase === "confirm" && "Confirm in your wallet…"}
                        {sealPhase === "mining" && "Sealing on Base…"}
                        {sealPhase === "idle" && (isReseal ? "Re-seal on Base" : "Seal on Base")}
                      </button>

                      {inFlight && (
                        <ol className="flex flex-col gap-1 text-[10px] text-white/55">
                          <li>{stepMark("attesting")} Server signs attestation</li>
                          <li>{stepMark("confirm")} You approve in your wallet</li>
                          <li>{stepMark("mining")} Confirming on Base</li>
                        </ol>
                      )}

                      {sealTxHash && (
                        <a
                          href={`https://basescan.org/tx/${sealTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-cyan-400 underline underline-offset-2"
                        >
                          View transaction on Basescan ↗
                        </a>
                      )}
                      {sealError && <p className="text-[11px] text-red-400">{sealError}</p>}
                    </div>
                  );
                })()}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
