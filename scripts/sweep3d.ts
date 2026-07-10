/**
 * Sweep the composition pipeline across real gotchis: fetch their chain data,
 * derive render hashes, ask the local composer for a dressed model, and print
 * status per gotchi. Usage: npx tsx scripts/sweep3d.ts <id> <id> ...
 */
import { gotchi3dHashes } from "../src/lib/gotchi3d";

const CORE = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const ids = process.argv.slice(2);

async function main() {
  const q = `{ ${ids.map((id, i) => `g${i}: aavegotchi(id: "${id}") { id name collateral hauntId numericTraits equippedWearables }`).join(" ")} }`;
  const res = await fetch(CORE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const data = (await res.json()).data ?? {};
  for (const key of Object.keys(data)) {
    const g = data[key];
    if (!g) continue;
    const hashes = gotchi3dHashes({
      collateral: g.collateral,
      hauntId: Number(g.hauntId),
      numericTraits: g.numericTraits.map(Number),
      equippedWearables: g.equippedWearables.map(Number),
    });
    if (hashes.length === 0) { console.log(`${g.id} ${g.name}: NO HASH (collateral?)`); continue; }
    // Official first (via proxy availability), then composed.
    let official = false;
    for (const h of hashes) {
      const r = await fetch(`https://www.aavegotchi.com/api/renderer/assets?url=${encodeURIComponent(`https://dzqjok0x69zbl.cloudfront.net/${h}/${h}_GLB.glb`)}`, { method: "GET", headers: { Range: "bytes=0-0" } }).catch(() => null);
      if (r?.ok) { official = true; break; }
    }
    const c = await fetch(`http://localhost:8787/api/gotchi3d/composed/${hashes[0]}`).catch(() => null);
    console.log(`${g.id} ${g.name}: official=${official} composed=${c?.status ?? "ERR"} hash=${hashes[0]}`);
  }
}
main();
