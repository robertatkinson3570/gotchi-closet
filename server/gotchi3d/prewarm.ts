/**
 * Full-collection prewarm: walks every summoned gotchi, mirrors its official
 * render (GLB + poster) from Pixelcraft's CDN onto this box, and composes the
 * model ourselves when no official exists. After one pass, every gotchi on
 * the site serves instantly from local disk, outfits changed anywhere are
 * picked up on the next nightly pass (or immediately on first view via the
 * on-demand path), and the site survives Pixelcraft's CDN going dark.
 *
 * Gentle by design: sequential with a small delay, ~2-4h for the initial
 * pass, near-instant on later passes (everything already on disk). Disable
 * with GOTCHI3D_PREWARM=0.
 */
import { gotchi3dHashes } from "../../src/lib/gotchi3d";
import { officialModel, officialPoster, resolveModel } from "./mirror";

const CORE = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const BOOT_DELAY_MS = 10 * 60 * 1000; // let the box settle after a deploy
const PASS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ITEM_DELAY_MS = 250; // be a polite CloudFront citizen

type Gotchi = { id: string; collateral: string; hauntId: string; numericTraits: string[]; equippedWearables: string[] };

async function* allGotchis(): AsyncGenerator<Gotchi> {
  let lastId = "0";
  for (;;) {
    const query = `{ aavegotchis(first: 1000, where: {id_gt: "${lastId}", status: 3}, orderBy: id) { id collateral hauntId numericTraits equippedWearables } }`;
    const res = await fetch(CORE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const page: Gotchi[] = (await res.json())?.data?.aavegotchis ?? [];
    if (page.length === 0) return;
    yield* page;
    lastId = page[page.length - 1].id;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runPass(): Promise<void> {
  let total = 0;
  let official = 0;
  let composed = 0;
  let missing = 0;
  for await (const g of allGotchis()) {
    total++;
    try {
      const hashes = gotchi3dHashes({
        collateral: g.collateral,
        hauntId: Number(g.hauntId),
        numericTraits: g.numericTraits.map(Number),
        equippedWearables: g.equippedWearables.map(Number),
      });
      if (hashes.length === 0) continue;
      const hash = hashes[0];
      const model = await resolveModel(hash);
      if (model?.source === "official") {
        official++;
        await officialPoster(hash); // grids use the poster when it exists
      } else if (model) {
        composed++;
      } else {
        missing++;
      }
    } catch { /* one gotchi never stops the pass */ }
    if (total % 500 === 0) console.log(`[gotchi3d] prewarm: ${total} scanned, ${official} official, ${composed} composed, ${missing} unresolvable`);
    await sleep(ITEM_DELAY_MS);
  }
  console.log(`[gotchi3d] prewarm pass complete: ${total} gotchis, ${official} official, ${composed} composed, ${missing} unresolvable`);
}

let started = false;

/** Kick off the boot-delayed nightly prewarm loop (idempotent). */
export function startPrewarm(): void {
  if (started || process.env.GOTCHI3D_PREWARM === "0") return;
  started = true;
  const loop = async () => {
    for (;;) {
      try {
        await runPass();
      } catch (e) {
        console.error("[gotchi3d] prewarm pass failed", e);
      }
      await sleep(PASS_INTERVAL_MS);
    }
  };
  setTimeout(() => { void loop(); }, Number(process.env.GOTCHI3D_PREWARM_DELAY_MS ?? BOOT_DELAY_MS));
}
