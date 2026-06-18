import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnChainSeal {
  soulHash: string;
  depthBips: number;
  soulAgeDays: number;
  blockNumber: number;
}

interface VerifyData {
  tokenId: string;
  configured: boolean;
  onChain: OnChainSeal | null;
  serverDepth: number | null;
  serverLevel: string | null;
  soulHash: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateHash(hash: string, chars = 10): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

function SealStatusBadge({
  onChain,
  configured,
}: {
  onChain: OnChainSeal | null;
  configured: boolean;
}) {
  if (onChain) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <span className="text-emerald-400 text-lg">✓</span>
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            Verified on Base
          </p>
          <p className="text-[11px] text-emerald-400/60">
            Block {onChain.blockNumber.toLocaleString()}
          </p>
        </div>
      </div>
    );
  }
  if (configured) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3">
        <span className="text-yellow-400 text-lg">◎</span>
        <p className="text-sm font-semibold text-yellow-300">Not yet sealed</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-white/30 text-lg">○</span>
      <p className="text-sm font-semibold text-white/40">
        On-chain sealing coming soon
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SoulVerifyPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tokenId) return;
    setLoading(true);
    setError(false);

    const base = import.meta.env.VITE_COMPANION_API_URL || "";
    fetch(`${base}/api/soul/verify/${tokenId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<VerifyData>;
      })
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tokenId]);

  return (
    <div className="min-h-screen bg-[#0a0a12] px-4 py-10 text-white">
      <div className="mx-auto max-w-sm">
        {/* Page heading */}
        <div className="mb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/60">
            Soul Certificate
          </p>
          <h1 className="mt-1 text-xl font-bold text-white">
            Verify Gotchi #{tokenId}
          </h1>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/4 py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/30 p-6 text-center text-sm text-red-400">
            Could not load verification data for #{tokenId}.
          </div>
        )}

        {/* Content */}
        {!loading && data && (
          <div className="flex flex-col gap-4">
            {/* Sprite */}
            <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <GotchiSvgById
                id={data.tokenId}
                className="h-full w-full object-contain"
              />
            </div>

            {/* Seal status badge */}
            <SealStatusBadge
              onChain={data.onChain}
              configured={data.configured}
            />

            {/* Server depth / level */}
            {data.serverDepth !== null && (
              <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
                <div className="flex justify-between text-[11px] text-white/40 mb-2">
                  <span>Soul Level</span>
                  <span>Depth</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lg font-bold bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">
                    {data.serverLevel}
                  </span>
                  <span className="text-lg font-bold text-white">
                    {Math.round(data.serverDepth ?? 0)}
                    <span className="text-sm font-normal text-white/30">/100</span>
                  </span>
                </div>
              </div>
            )}

            {/* Soul hash */}
            {data.soulHash && (
              <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">
                  Soul Hash
                </p>
                <p className="font-mono text-[11px] text-white/55 break-all">
                  {truncateHash(data.soulHash)}
                </p>
              </div>
            )}

            {/* On-chain details (when sealed) */}
            {data.onChain && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 flex flex-col gap-1.5">
                <p className="text-[10px] uppercase tracking-widest text-emerald-400/50 mb-1">
                  On-Chain Record
                </p>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Depth (bips)</span>
                  <span className="text-white/70">{data.onChain.depthBips}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Soul age (days)</span>
                  <span className="text-white/70">{data.onChain.soulAgeDays}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Block</span>
                  <span className="font-mono text-white/70">
                    {data.onChain.blockNumber.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Soul hash</span>
                  <span className="font-mono text-white/55">
                    {truncateHash(data.onChain.soulHash, 6)}
                  </span>
                </div>
              </div>
            )}

            {/* Watermark */}
            <p className="text-center text-[9px] text-white/15 mt-2">
              gotchi-closet.xyz · Soul Verify
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
