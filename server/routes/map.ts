import { Router } from "express";
import { subgraphFetch } from "../aavegotchi/subgraphFetch";

/**
 * Citaadel map data: every REALM parcel (≈30k), compacted for one cached
 * payload instead of 30 client-side subgraph pages. Refreshed hourly —
 * parcel geometry never changes and owners drift slowly; live listing
 * overlays come straight from the client.
 *
 * Response shape:
 *   { updatedAt, owners: string[], parcels: [tokenId, x, y, size, district, ownerIdx, name][] }
 */

const GOTCHIVERSE_SUBGRAPH =
  process.env.GOTCHIVERSE_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";

type ParcelRow = [number, number, number, number, number, number, string];
type MapPayload = { updatedAt: number; owners: string[]; parcels: ParcelRow[] };

const TTL_MS = 60 * 60 * 1000;
let cache: MapPayload | null = null;
let inflight: Promise<MapPayload> | null = null;

async function fetchAllParcels(): Promise<MapPayload> {
  const owners: string[] = [];
  const ownerIdx = new Map<string, number>();
  const parcels: ParcelRow[] = [];
  let cursor = "0";
  // tokenId_gt cursor pagination — `skip` caps out at 5000 on graph-node.
  for (let page = 0; page < 60; page++) {
    const query = `{
      parcels(first: 1000, orderBy: tokenId, orderDirection: asc, where: { tokenId_gt: "${cursor}" }) {
        tokenId coordinateX coordinateY size district owner parcelHash
      }
    }`;
    const res = await subgraphFetch({ query }, { primary: GOTCHIVERSE_SUBGRAPH });
    if (!res.ok) throw new Error(`gotchiverse subgraph HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { parcels?: { tokenId: string; coordinateX: string; coordinateY: string; size: string; district: string; owner: string | null; parcelHash: string }[] };
      errors?: unknown;
    };
    const rows = json.data?.parcels;
    if (!rows) throw new Error(`gotchiverse subgraph error: ${JSON.stringify(json.errors ?? json).slice(0, 200)}`);
    if (rows.length === 0) break;
    for (const p of rows) {
      const owner = (p.owner ?? "").toLowerCase();
      let oi = ownerIdx.get(owner);
      if (oi === undefined) {
        oi = owners.length;
        owners.push(owner);
        ownerIdx.set(owner, oi);
      }
      parcels.push([
        Number(p.tokenId),
        Number(p.coordinateX),
        Number(p.coordinateY),
        Number(p.size),
        Number(p.district),
        oi,
        p.parcelHash ?? "",
      ]);
    }
    cursor = rows[rows.length - 1].tokenId;
    if (rows.length < 1000) break;
  }
  return { updatedAt: Date.now(), owners, parcels };
}

const mapRoutes = Router();

mapRoutes.get("/parcels", async (_req, res) => {
  try {
    if (cache && Date.now() - cache.updatedAt < TTL_MS) {
      res.set("Cache-Control", "public, max-age=1800");
      return res.json(cache);
    }
    inflight ??= fetchAllParcels().finally(() => { inflight = null; });
    cache = await inflight;
    res.set("Cache-Control", "public, max-age=1800");
    return res.json(cache);
  } catch (err) {
    // Serve a stale cache over a hard failure — geometry doesn't go bad.
    if (cache) return res.json(cache);
    return res.status(502).json({ error: err instanceof Error ? err.message : "parcel fetch failed" });
  }
});

export default mapRoutes;
