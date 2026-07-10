/**
 * Build server/gotchi3d/hand-donors.json: for every wearable id that any live
 * gotchi has equipped in a hand slot, find one OFFICIAL dressed render (a
 * "donor") whose GLB exists on the render CDN and contains that item.
 *
 * Why: the standalone wearable GLBs (dapp.aavegotchi.com/brand/items/3d) are
 * raw prefab meshes in arbitrary local spaces (some microscopic, some
 * world-authored, some upside down). Official dressed models place hand items
 * under the body rig's hand sockets via a "Wearable_Mesh_<id>(Clone)" subtree
 * that carries the item-specific assembly transforms. Those transforms exist
 * ONLY inside official dressed GLBs, so composition grafts them from a donor.
 *
 * Usage: npx tsx scripts/buildHandDonors.ts
 */
import fs from "node:fs";
import path from "node:path";
import { gotchi3dHashes } from "../src/lib/gotchi3d";

const CORE = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const PROXY = (url: string) => `https://www.aavegotchi.com/api/renderer/assets?url=${encodeURIComponent(url)}`;
const GLB = (hash: string) => `https://dzqjok0x69zbl.cloudfront.net/${hash}/${hash}_GLB.glb`;
const OUT = path.join(process.cwd(), "server", "gotchi3d", "hand-donors.json");

type Gotchi = { id: string; collateral: string; hauntId: string; numericTraits: string[]; equippedWearables: string[] };

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(CORE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return (await res.json()).data as T;
}

async function glbExists(hash: string): Promise<boolean> {
  try {
    // Verify actual GLB bytes (magic "glTF"), not just an OK status: the
    // proxy has returned transient 200s for missing renders, which poisoned
    // the map (item 51's first donor never existed).
    const r = await fetch(PROXY(GLB(hash)), { headers: { Range: "bytes=0-3" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return false;
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length >= 4 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46;
  } catch {
    return false;
  }
}

async function main() {
  // 1. Scan all summoned gotchis for hand-slot (4/5) AND pet-slot (6)
  // wearables. Pets need donors too: their standalone GLBs are authored
  // centered at the origin (hidden inside the body when root-merged), while
  // official renders position them via the PetRoot clone subtree.
  const samples = new Map<number, Gotchi[]>();
  let lastId = "0";
  let total = 0;
  for (;;) {
    const data = await gql<{ aavegotchis: Gotchi[] }>(
      `{ aavegotchis(first: 1000, where: {id_gt: "${lastId}", status: 3}, orderBy: id) { id collateral hauntId numericTraits equippedWearables } }`,
    );
    const gs = data?.aavegotchis ?? [];
    if (gs.length === 0) break;
    total += gs.length;
    for (const g of gs) {
      for (const slot of [4, 5, 6]) {
        const id = Number(g.equippedWearables[slot]) || 0;
        if (id <= 0) continue;
        const list = samples.get(id) ?? [];
        if (list.length < 25) list.push(g);
        samples.set(id, list);
      }
    }
    lastId = gs[gs.length - 1].id;
  }
  console.log(`scanned ${total} gotchis, ${samples.size} distinct hand/pet items`);

  // 2. For each item, probe sample gotchis' official hashes until one exists.
  const donors: Record<string, { hash: string }> = {};
  const missing: number[] = [];
  const ids = [...samples.keys()].sort((a, b) => a - b);
  let done = 0;
  const CONCURRENCY = 6;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const id = ids.shift();
      if (id === undefined) return;
      const seen = new Set<string>();
      let found: string | null = null;
      outer: for (const g of samples.get(id)!) {
        const hashes = gotchi3dHashes({
          collateral: g.collateral,
          hauntId: Number(g.hauntId),
          numericTraits: g.numericTraits.map(Number),
          equippedWearables: g.equippedWearables.map(Number),
        });
        for (const h of hashes) {
          if (seen.has(h)) continue;
          seen.add(h);
          if (await glbExists(h)) { found = h; break outer; }
          if (seen.size >= 12) break outer; // cap probes per item
        }
      }
      if (found) donors[String(id)] = { hash: found };
      else missing.push(id);
      done++;
      console.log(`[${done}/${samples.size}] item ${id}: ${found ?? "NO DONOR"}`);
    }
  }));

  fs.writeFileSync(OUT, JSON.stringify(donors, null, 1));
  console.log(`\nwrote ${OUT}: ${Object.keys(donors).length} donors, ${missing.length} missing${missing.length ? ` (${missing.sort((a, b) => a - b).join(",")})` : ""}`);
}

main();
