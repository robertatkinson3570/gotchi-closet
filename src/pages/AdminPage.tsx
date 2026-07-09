// src/pages/AdminPage.tsx
import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { siteAdminMessage } from "@/lib/analytics/auth";
import { fetchEvents } from "@/lib/analytics/api";
import type { Sig, WindowKey } from "@/lib/analytics/types";
import { EventGrid } from "@/components/admin/EventGrid";
import { AnalyticsSummary } from "@/components/admin/AnalyticsSummary";
import { XpDropsOperator } from "@/components/admin/XpDropsOperator";

// Client-side hint only. The real gate is the server signature check on the data
// endpoints; a non-admin who loads this page sees "Not found" and fetches nothing.
const ADMINS = new Set([
  "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2",
  "0xc4cb6cb969e8b4e309ab98e4da51b77887afad96",
]);

export default function AdminPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sig, setSig] = useState<Sig | null>(null);
  const [window, setWindow] = useState<WindowKey>("7d");
  const [filter, setFilter] = useState("");
  const [eventType, setEventType] = useState<"all" | "pageview" | "connect">("all");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [view, setView] = useState<"analytics" | "xpdrops">("analytics");

  const isAdmin = !!address && ADMINS.has(address.toLowerCase());

  const authorize = useCallback(async () => {
    if (!address) return;
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: siteAdminMessage(address, signedAt) });
    setSig({ wallet: address, signedAt, signature });
  }, [address, signMessageAsync]);

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["analytics-events", sig?.signedAt, window],
    queryFn: () => fetchEvents(sig!, window),
    enabled: !!sig,
  });

  // Non-admins get no signal that this page exists.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="opacity-60 mt-2">The page you are looking for does not exist.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Admin</h1>

      <div className="flex items-center gap-1.5 mb-4">
        <button onClick={() => setView("analytics")} className={`h-8 px-3 rounded text-sm font-medium border ${view === "analytics" ? "bg-sky-500/20 text-sky-300 border-sky-500/40" : "border-white/10 opacity-70 hover:bg-white/5"}`}>Analytics</button>
        <button onClick={() => setView("xpdrops")} className={`h-8 px-3 rounded text-sm font-medium border ${view === "xpdrops" ? "bg-sky-500/20 text-sky-300 border-sky-500/40" : "border-white/10 opacity-70 hover:bg-white/5"}`}>XP drops</button>
      </div>

      {view === "xpdrops" ? (
        <XpDropsOperator />
      ) : !sig ? (
        <button type="button" onClick={authorize} className="rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white">
          Sign in to view analytics
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by address, IP, or path"
              className="rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm min-w-[240px]"
            />
            <select value={eventType} onChange={(e) => setEventType(e.target.value as any)} className="rounded border border-white/15 bg-transparent px-2 py-1.5 text-sm">
              <option value="all">All events</option>
              <option value="pageview">Page views</option>
              <option value="connect">Connects</option>
            </select>
            <select value={window} onChange={(e) => setWindow(e.target.value as WindowKey)} className="rounded border border-white/15 bg-transparent px-2 py-1.5 text-sm">
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} />
              Connected wallets only
            </label>
          </div>

          {isLoading && <div className="opacity-60 text-sm">Loading...</div>}
          {error && <div className="text-red-400 text-sm">Could not load analytics. Try signing in again.</div>}

          {!isLoading && !error && (
            <>
              <EventGrid events={events} filter={filter} eventType={eventType} connectedOnly={connectedOnly} />
              <AnalyticsSummary events={events} />
            </>
          )}
        </>
      )}
    </div>
  );
}
