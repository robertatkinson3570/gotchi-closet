import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Crosshair, Loader2, Search, X } from "lucide-react";
import { CORE_SUBGRAPH, GBM_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { REALM_DIAMOND_BASE } from "@/lib/lending/contracts";
import { env } from "@/lib/env";
import { BuyButton } from "@/components/explorer/BuyButton";
import { shortenAddress } from "@/lib/address";

/**
 * The Citaadel — every REALM parcel on one canvas. Color by district/size/
 * market status, search by parcel/name/owner, click a parcel for details and
 * a direct Baazaar buy. Parcels come from our /api/map/parcels cache;
 * listing + auction overlays are queried live client-side.
 */

// [tokenId, x, y, size, district, ownerIdx, name]
type ParcelRow = [number, number, number, number, number, number, string];
type MapPayload = { updatedAt: number; owners: string[]; parcels: ParcelRow[] };

const SIZE_DIMS: Record<number, [number, number]> = {
  0: [8, 8],    // humble
  1: [16, 16],  // reasonable
  2: [32, 64],  // spacious (vertical)
  3: [64, 32],  // spacious (horizontal)
  4: [64, 64],  // partner
  5: [64, 64],
};
const SIZE_LABEL: Record<number, string> = { 0: "Humble", 1: "Reasonable", 2: "Spacious (V)", 3: "Spacious (H)", 4: "Partner", 5: "Guardian" };

type ColorMode = "district" | "size" | "market" | "price";

const SIZE_COLORS: Record<number, string> = {
  0: "#64748b", // slate
  1: "#8b5cf6", // violet
  2: "#06b6d4", // cyan
  3: "#06b6d4",
  4: "#f59e0b", // amber
  5: "#f59e0b",
};

function districtColor(d: number): string {
  // Golden-angle hue walk gives adjacent districts distinct colors.
  const hue = (d * 137.508) % 360;
  return `hsl(${hue} 45% 42%)`;
}

function priceColor(price: number, min: number, max: number): string {
  if (!(price > 0)) return "#334155";
  const t = Math.min(1, Math.max(0, (Math.log(price) - Math.log(min)) / Math.max(1e-9, Math.log(max) - Math.log(min))));
  const hue = 180 - t * 160; // teal (cheap) -> pink/red (expensive)
  return `hsl(${hue} 75% 52%)`;
}

type Listing = { id: string; tokenId: string; priceInWei: string };
type Auction = { id: string; tokenId: string; highestBid: string; endsAt: string };

type Selected = {
  row: ParcelRow;
  owner: string;
  listing?: Listing;
  auction?: Auction;
};

export function CitaadelMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("district");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["citaadel-parcels"],
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    queryFn: async (): Promise<MapPayload> => {
      // Same origin rule as the companion/steward APIs: Vercel serves the SPA
      // only, so in prod the express routes live on api.gotchicloset.com; in
      // local dev the base is empty and the Vite proxy handles /api.
      const r = await fetch(`${env.companionApiUrl}/api/map/parcels`);
      if (!r.ok) throw new Error(`map data HTTP ${r.status}`);
      return r.json();
    },
  });

  // Active Baazaar parcel listings (category 4 on the realm diamond).
  const { data: listings } = useQuery({
    queryKey: ["citaadel-listings"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<number, Listing>> => {
      const q = `{ erc721Listings(first: 1000, where: { category: 4, cancelled: false, timePurchased: "0" }, orderBy: timeCreated, orderDirection: desc){ id tokenId priceInWei } }`;
      const r = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      const m = new Map<number, Listing>();
      for (const l of j.data?.erc721Listings ?? []) m.set(Number(l.tokenId), l);
      return m;
    },
  });

  // Live GBM auctions on the realm diamond.
  const { data: auctions } = useQuery({
    queryKey: ["citaadel-auctions"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<number, Auction>> => {
      const now = Math.floor(Date.now() / 1000);
      const q = `{ auctions(first: 500, where: { cancelled: false, claimed: false, endsAt_gt: "${now}", contractAddress: "${REALM_DIAMOND_BASE.toLowerCase()}" }){ id tokenId highestBid endsAt } }`;
      const r = await fetch(GBM_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      const m = new Map<number, Auction>();
      for (const a of j.data?.auctions ?? []) m.set(Number(a.tokenId), a);
      return m;
    },
  });

  // World bounds + spatial hash for hit-testing.
  const world = useMemo(() => {
    if (!data?.parcels.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of data.parcels) {
      const [w, h] = SIZE_DIMS[p[3]] ?? [16, 16];
      if (p[1] < minX) minX = p[1];
      if (p[2] < minY) minY = p[2];
      if (p[1] + w > maxX) maxX = p[1] + w;
      if (p[2] + h > maxY) maxY = p[2] + h;
    }
    const CELL = 128;
    const grid = new Map<string, number[]>();
    data.parcels.forEach((p, i) => {
      const [w, h] = SIZE_DIMS[p[3]] ?? [16, 16];
      for (let cx = Math.floor(p[1] / CELL); cx <= Math.floor((p[1] + w) / CELL); cx++) {
        for (let cy = Math.floor(p[2] / CELL); cy <= Math.floor((p[2] + h) / CELL); cy++) {
          const k = `${cx}_${cy}`;
          const arr = grid.get(k);
          if (arr) arr.push(i); else grid.set(k, [i]);
        }
      }
    });
    return { minX, minY, maxX, maxY, grid, CELL };
  }, [data]);

  // Price range for the price color ramp.
  const priceRange = useMemo(() => {
    if (!listings || listings.size === 0) return { min: 1, max: 1 };
    let min = Infinity, max = 0;
    for (const l of listings.values()) {
      const v = Number(l.priceInWei) / 1e18;
      if (v > 0) { if (v < min) min = v; if (v > max) max = v; }
    }
    return { min: Math.max(0.01, min), max: Math.max(min, max) };
  }, [listings]);

  // Search matches: parcel id, name substring, or owner address.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return null;
    const set = new Set<number>();
    const isAddr = /^0x[a-f0-9]{6,40}$/.test(q);
    data.parcels.forEach((p, i) => {
      if (isAddr) {
        if (data.owners[p[5]]?.startsWith(q)) set.add(i);
      } else if (String(p[0]) === q || (p[6] && p[6].toLowerCase().includes(q))) {
        set.add(i);
      }
    });
    return set;
  }, [search, data]);

  // View transform (world -> screen): screen = (world - t) * scale.
  const view = useRef({ scale: 0.1, tx: 0, ty: 0 });
  const raf = useRef(0);
  const needsDraw = useRef(true);
  const requestDraw = useCallback(() => { needsDraw.current = true; }, []);

  const fitView = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !world) return;
    const pad = 40;
    const sx = (cv.clientWidth - pad) / (world.maxX - world.minX);
    const sy = (cv.clientHeight - pad) / (world.maxY - world.minY);
    const scale = Math.min(sx, sy);
    view.current = {
      scale,
      tx: world.minX - (cv.clientWidth / scale - (world.maxX - world.minX)) / 2,
      ty: world.minY - (cv.clientHeight / scale - (world.maxY - world.minY)) / 2,
    };
    requestDraw();
  }, [world, requestDraw]);

  useEffect(() => { fitView(); }, [fitView]);

  // Main draw loop — only repaints when flagged.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !data || !world) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dark = document.documentElement.classList.contains("dark");
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      if (!needsDraw.current) return;
      needsDraw.current = false;

      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = dark ? "#0b0e17" : "#eef1f8";
      ctx.fillRect(0, 0, W, H);

      const { scale, tx, ty } = view.current;
      const dimOthers = matches && matches.size > 0;

      for (let i = 0; i < data.parcels.length; i++) {
        const p = data.parcels[i];
        const [w, h] = SIZE_DIMS[p[3]] ?? [16, 16];
        const x = (p[1] - tx) * scale;
        const y = (p[2] - ty) * scale;
        const sw = w * scale, sh = h * scale;
        if (x + sw < 0 || y + sh < 0 || x > W || y > H) continue;

        const id = p[0];
        const listing = listings?.get(id);
        const auction = auctions?.get(id);

        let fill: string;
        if (colorMode === "market") {
          fill = listing ? "#10b981" : auction ? "#f59e0b" : dark ? "#1e2534" : "#cbd5e1";
        } else if (colorMode === "price") {
          fill = listing ? priceColor(Number(listing.priceInWei) / 1e18, priceRange.min, priceRange.max) : dark ? "#1e2534" : "#cbd5e1";
        } else if (colorMode === "size") {
          fill = SIZE_COLORS[p[3]] ?? "#64748b";
        } else {
          fill = districtColor(p[4]);
        }

        ctx.globalAlpha = dimOthers && !matches!.has(i) ? 0.15 : 1;
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, Math.max(sw, 1.2), Math.max(sh, 1.2));

        // Market glow ring in non-market modes so listings stay visible.
        if ((listing || auction) && colorMode !== "market" && colorMode !== "price" && scale > 0.04) {
          ctx.strokeStyle = listing ? "#34d399" : "#fbbf24";
          ctx.lineWidth = Math.max(1, scale * 2);
          ctx.strokeRect(x, y, Math.max(sw, 1.2), Math.max(sh, 1.2));
        }
        if (hoverId === id || selected?.row[0] === id) {
          ctx.strokeStyle = "#e879f9";
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 1, y - 1, Math.max(sw, 1.2) + 2, Math.max(sh, 1.2) + 2);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [data, world, colorMode, listings, auctions, matches, hoverId, selected, priceRange]);

  useEffect(() => { requestDraw(); }, [colorMode, matches, hoverId, selected, listings, auctions, requestDraw]);

  // Hit test via the spatial grid.
  const parcelAt = useCallback((clientX: number, clientY: number): number | null => {
    const cv = canvasRef.current;
    if (!cv || !data || !world) return null;
    const rect = cv.getBoundingClientRect();
    const { scale, tx, ty } = view.current;
    const wx = (clientX - rect.left) / scale + tx;
    const wy = (clientY - rect.top) / scale + ty;
    const key = `${Math.floor(wx / world.CELL)}_${Math.floor(wy / world.CELL)}`;
    for (const i of world.grid.get(key) ?? []) {
      const p = data.parcels[i];
      const [w, h] = SIZE_DIMS[p[3]] ?? [16, 16];
      if (wx >= p[1] && wx <= p[1] + w && wy >= p[2] && wy <= p[2] + h) return i;
    }
    return null;
  }, [data, world]);

  // Pointer interactions: drag pan, wheel zoom, pinch zoom, hover, click.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    const zoomAt = (cx: number, cy: number, factor: number) => {
      const v = view.current;
      const ns = Math.min(8, Math.max(0.01, v.scale * factor));
      v.tx += cx / v.scale - cx / ns;
      v.ty += cy / v.scale - cy / ns;
      v.scale = ns;
      requestDraw();
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          const rect = cv.getBoundingClientRect();
          const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
          zoomAt(cx, cy, d / pinchDist);
        }
        pinchDist = d;
        return;
      }
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        view.current.tx -= dx / view.current.scale;
        view.current.ty -= dy / view.current.scale;
        lastX = e.clientX; lastY = e.clientY;
        requestDraw();
      } else {
        const i = parcelAt(e.clientX, e.clientY);
        setHoverId(i != null && data ? data.parcels[i][0] : null);
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (dragging && !moved) {
        const i = parcelAt(e.clientX, e.clientY);
        if (i != null && data) {
          const row = data.parcels[i];
          setSelected({
            row,
            owner: data.owners[row[5]] ?? "",
            listing: listings?.get(row[0]),
            auction: auctions?.get(row[0]),
          });
        } else {
          setSelected(null);
        }
      }
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("wheel", onWheel);
    };
  }, [data, listings, auctions, parcelAt, requestDraw]);

  const counts = useMemo(() => {
    if (!data) return null;
    const c = { humble: 0, reasonable: 0, spacious: 0, partner: 0 };
    for (const p of data.parcels) {
      if (p[3] === 0) c.humble++;
      else if (p[3] === 1) c.reasonable++;
      else if (p[3] === 2 || p[3] === 3) c.spacious++;
      else c.partner++;
    }
    return c;
  }, [data]);

  if (error) {
    return <div className="text-center py-12 text-sm text-muted-foreground">Couldn't load the Citaadel map. Try again shortly.</div>;
  }

  return (
    <div className="px-2 md:px-3 pb-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Parcel #, name or owner 0x…"
            className="h-8 w-52 sm:w-64 rounded-lg border border-border/60 bg-background pl-7 pr-6 text-xs"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
          )}
        </div>
        <select
          value={colorMode}
          onChange={(e) => setColorMode(e.target.value as ColorMode)}
          className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs font-medium cursor-pointer"
          title="Color parcels by"
        >
          <option value="district">Color: District</option>
          <option value="size">Color: Size</option>
          <option value="market">Color: For sale</option>
          <option value="price">Color: Price</option>
        </select>
        <button onClick={fitView} title="Fit view" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border/60 text-xs text-muted-foreground hover:text-primary hover:border-primary/40">
          <Crosshair className="w-3.5 h-3.5" /> Fit
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          {matches && <span className="text-primary font-semibold">{matches.size} match{matches.size === 1 ? "" : "es"}</span>}
          {counts && (
            <span className="hidden sm:inline tabular-nums">
              {data!.parcels.length.toLocaleString()} parcels · {counts.humble.toLocaleString()} humble · {counts.reasonable.toLocaleString()} reasonable · {counts.spacious.toLocaleString()} spacious
            </span>
          )}
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Baazaar</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" /> Auction</span>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative rounded-2xl border border-border/40 overflow-hidden bg-background/60" style={{ height: "min(72vh, 640px)" }}>
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm z-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" /> Charting 30,000+ parcels…
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full touch-none cursor-crosshair" />

        {/* Detail panel */}
        {selected && (
          <div className="absolute right-2 top-2 bottom-2 sm:bottom-auto w-[calc(100%-1rem)] sm:w-72 rounded-2xl border border-border/60 bg-background/95 backdrop-blur p-3.5 shadow-xl overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-sm font-bold">{selected.row[6] ? selected.row[6].replace(/-/g, " ") : `Parcel #${selected.row[0]}`}</div>
                <div className="text-[10px] text-muted-foreground">#{selected.row[0]} · District {selected.row[4]} · {SIZE_LABEL[selected.row[3]] ?? "?"}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Coordinates</span><span className="tabular-nums">{selected.row[1]}, {selected.row[2]}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Owner</span>
                {selected.owner ? (
                  <Link to={`/u/${selected.owner}`} className="text-primary hover:underline font-mono">{shortenAddress(selected.owner)}</Link>
                ) : <span>—</span>}
              </div>
              {selected.auction && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GBM auction</span>
                  <span className="font-semibold text-amber-500 tabular-nums">{(Number(selected.auction.highestBid) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 1 })} GHST bid</span>
                </div>
              )}
              {selected.listing ? (
                <div className="pt-2 border-t border-border/40">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Baazaar price</span>
                    <span className="font-bold text-emerald-500 tabular-nums">{(Number(selected.listing.priceInWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 1 })} GHST</span>
                  </div>
                  <BuyButton
                    listingId={selected.listing.id}
                    tokenId={String(selected.row[0])}
                    priceInWei={selected.listing.priceInWei}
                    kind="erc721"
                    contractAddress={REALM_DIAMOND_BASE}
                    label={`Parcel #${selected.row[0]}`}
                    className="w-full"
                  />
                </div>
              ) : !selected.auction ? (
                <div className="pt-1 text-[10px] text-muted-foreground">Not currently for sale.</div>
              ) : null}
            </div>
          </div>
        )}

        {/* Hover chip */}
        {hoverId != null && !selected && (
          <div className="absolute left-2 bottom-2 rounded-lg border border-border/60 bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] shadow pointer-events-none">
            Parcel #{hoverId}{listings?.get(hoverId) ? ` · ${(Number(listings.get(hoverId)!.priceInWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 1 })} GHST` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
