import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Gauge, Loader2 } from "lucide-react";
import { env } from "@/lib/env";
import { shortAddress } from "@/lib/format";
import type { QuorumReport } from "@/lib/quorumVp";

/**
 * DAO-wide votable VP ("live quorum") — community-requested dashboard
 * (Discord ask, 2026-07: "Live Quorum, the calculation of all eligible VP").
 * Data comes from the server pipeline that ports the four live Snapshot
 * strategies; see server/dao/quorum.ts.
 */

type QuorumResponse = QuorumReport | { building: true };

async function fetchQuorum(): Promise<QuorumResponse> {
  const res = await fetch(`${env.companionApiUrl}/api/dao/quorum`);
  if (res.status === 202) return { building: true };
  if (!res.ok) throw new Error(`quorum request failed: ${res.status}`);
  return res.json();
}

const isBuilding = (d: QuorumResponse | undefined): d is { building: true } =>
  !!d && "building" in d;

const fmtVp = (v: number) => Math.round(v).toLocaleString();

const TILES: { key: keyof QuorumReport["components"]; label: string; className: string }[] = [
  { key: "walletGhst", label: "Wallet GHST", className: "text-sky-400" },
  { key: "gotchis", label: "Gotchis", className: "text-emerald-400" },
  { key: "wearables", label: "Wearables", className: "text-purple-400" },
  { key: "realm", label: "REALM", className: "text-amber-400" },
  { key: "stakedLp", label: "Staked LP", className: "text-rose-400" },
];

export function QuorumPanel({ yourVp }: { yourVp?: number | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dao-quorum"],
    queryFn: fetchQuorum,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (isBuilding(query.state.data) ? 5_000 : 10 * 60_000),
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-5 ring-1 ring-primary/5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Gauge className="w-4 h-4 text-primary" /> Votable voting power (live)
        </div>
        {data && !isBuilding(data) && (
          <span className="text-[10px] text-muted-foreground">
            as of {new Date(data.updatedAt).toLocaleTimeString()} · refreshes every 30 min
          </span>
        )}
      </div>

      {isLoading || isBuilding(data) ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Computing votable VP across all holders, first run takes about a minute…
        </div>
      ) : !data ? (
        <p className="text-[11px] text-muted-foreground py-2">
          Votable VP is unavailable right now. It will be back after the next refresh.
        </p>
      ) : (
        <>
          {/* Component tiles — the fren's mockup, GotchiCloset-styled */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-3">
            <div className="rounded-xl border border-border/40 bg-background/50 p-2.5">
              <div className="text-[11px] font-semibold text-muted-foreground">Total VP</div>
              <div className="text-base font-bold tabular-nums">{fmtVp(data.totalVp)}</div>
            </div>
            {TILES.map((t) => (
              <div key={t.key} className="rounded-xl border border-border/40 bg-background/50 p-2.5">
                <div className={`text-[11px] font-semibold ${t.className}`}>{t.label}</div>
                <div className="text-base font-bold tabular-nums">
                  {fmtVp(data.components[t.key].vp)}
                </div>
              </div>
            ))}
          </div>

          {/* Quorum meter */}
          <div className="mb-3">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>
                Quorum {fmtVp(data.quorum)} VP ={" "}
                {data.totalVp > 0 ? Math.round((data.quorum / data.totalVp) * 100) : 0}% of votable
                VP would need to vote
              </span>
              {typeof yourVp === "number" && yourVp > 0 && data.totalVp > 0 && (
                <span>
                  your VP ={" "}
                  {((yourVp / data.totalVp) * 100).toLocaleString(undefined, {
                    maximumSignificantDigits: 2,
                  })}
                  % of votable
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{
                  width: `${data.totalVp > 0 ? Math.min(100, (data.quorum / data.totalVp) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Pending VP sources */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {data.pending.map((p) => (
              <span
                key={p.label}
                title={p.note}
                className="text-[10px] rounded-full border border-dashed border-amber-500/50 text-amber-500 px-2 py-0.5"
              >
                ◌ {p.label} · no VP yet
              </span>
            ))}
          </div>

          {/* Methodology */}
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-primary select-none">
              How votable VP is calculated
            </summary>
            <div className="mt-3 space-y-4 text-[11px] text-muted-foreground">
              <p>
                Ports the four live strategies on the{" "}
                <span className="font-mono">aavegotchi.eth</span> Snapshot space: wallet GHST
                (Base), gotchi BRS + equipped wearables, wallet wearables at their Maall values,
                REALM parcels (32/128/1028/2048 VP by size) and the GHST share of LP staked in the
                GLTR farm. Snapshot fixes each voter&apos;s VP at the block a proposal is created,
                so this is the quorum base for the <em>next</em> proposal, not any active one.
              </p>

              <div>
                <div className="font-semibold mb-1">Wallet GHST breakdown</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    ["Total supply", data.ghst.totalSupply],
                    ["DAO-controlled", data.ghst.daoControlled],
                    ["Pools & escrow", data.ghst.infraContracts],
                    ["Other contracts", data.ghst.otherContracts],
                    ["Votable", data.ghst.votable],
                  ].map(([label, v]) => (
                    <div key={label as string} className="rounded-lg border border-border/40 bg-background/50 p-2">
                      <div>{label}</div>
                      <div className="font-bold text-foreground tabular-nums">{fmtVp(v as number)}</div>
                    </div>
                  ))}
                </div>
                {data.ghst.method === "supply-minus-exclusions" && (
                  <p className="mt-1">
                    Holder scan unavailable, contract-held GHST beyond the labeled list is
                    currently counted as votable.
                  </p>
                )}
              </div>

              <div>
                <div className="font-semibold mb-1">
                  Excluded wallets (DAO-controlled per AGIP-145, plus escrow/pool contracts)
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 divide-y divide-border/30">
                  {data.excludedWallets.map((w) => (
                    <a
                      key={w.address}
                      href={`https://basescan.org/address/${w.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/30"
                    >
                      <span className="truncate">
                        <span
                          className={`inline-block w-10 text-[9px] font-bold uppercase ${w.kind === "dao" ? "text-amber-500" : "text-muted-foreground/70"}`}
                        >
                          {w.kind}
                        </span>
                        {w.label}
                      </span>
                      <span className="shrink-0 font-mono inline-flex items-center gap-1.5">
                        {w.ghst > 0 && <span className="tabular-nums">{fmtVp(w.ghst)} GHST</span>}
                        {shortAddress(w.address)} <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
