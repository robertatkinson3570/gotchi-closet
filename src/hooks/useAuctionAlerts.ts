import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useToast } from "@/ui/use-toast";
import { GBM_SUBGRAPH } from "@/lib/subgraph";
import { itemMetaSync } from "@/lib/explorer/itemMeta";

// Watchlist alerts (a power-user feature the dapp doesn't have): while the
// app is open, poll the watched GBM auctions and surface a toast — plus a
// browser notification when permitted — on outbid / new top bid / ending
// soon. Watchlist ids are shared with AuctionGrid's star toggles.
const WATCH_KEY = "gc-auction-watchlist";
const STATE_KEY = "gc-auction-alert-state";
const POLL_MS = 60_000;
const ENDING_SOON_S = 15 * 60;

type AlertState = Record<string, { bid?: string; bidder?: string; soon?: 1 }>;

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function browserNotify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon.png" });
    }
  } catch {
    /* unsupported environment */
  }
}

export function useAuctionAlerts() {
  const { address } = useAccount();
  const { toast } = useToast();
  const addrRef = useRef(address);
  addrRef.current = address;

  useEffect(() => {
    let stopped = false;

    async function poll() {
      const watch = loadJson<string[]>(WATCH_KEY, []).slice(0, 100);
      if (watch.length === 0) return;
      const state = loadJson<AlertState>(STATE_KEY, {});
      try {
        const res = await fetch(GBM_SUBGRAPH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{ auctions(first: ${watch.length}, where: { id_in: [${watch.map((id) => `"${id}"`).join(",")}] }) { id tokenId highestBid highestBidder endsAt claimed cancelled } }`,
          }),
        });
        const j = await res.json();
        const now = Math.floor(Date.now() / 1000);
        for (const a of j?.data?.auctions ?? []) {
          if (a.claimed || a.cancelled) continue;
          const prev = state[a.id] ?? {};
          const name = itemMetaSync(a.tokenId)?.name ?? `#${a.tokenId}`;
          const bid = a.highestBid ?? "0";
          const bidder = (a.highestBidder ?? "").toLowerCase();
          const me = (addrRef.current ?? "").toLowerCase();
          const ghst = (Number(bid) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

          if (prev.bid != null && bid !== prev.bid) {
            const outbidMe = !!me && prev.bidder === me && bidder !== me;
            const title = outbidMe ? `You've been outbid on ${name}` : `New top bid on ${name}`;
            const body = `${ghst} GHST · auction #${a.id}`;
            toast({ title, description: body, variant: outbidMe ? "destructive" : undefined });
            browserNotify(title, body);
          }

          const left = Number(a.endsAt) - now;
          if (left > 0 && left <= ENDING_SOON_S && !prev.soon) {
            const title = `${name} ends in ~${Math.max(1, Math.round(left / 60))} min`;
            const body = `Watched auction #${a.id} · top bid ${ghst} GHST`;
            toast({ title, description: body });
            browserNotify(title, body);
            prev.soon = 1;
          }

          state[a.id] = { ...prev, bid, bidder };
        }
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* quota */ }
      } catch {
        /* subgraph hiccup — next tick retries */
      }
    }

    poll();
    const id = setInterval(() => { if (!stopped) poll(); }, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [toast]);
}
