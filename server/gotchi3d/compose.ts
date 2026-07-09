/**
 * Server-side gotchi 3D composition: builds the dressed model Pixelcraft's
 * offline renderer never generated, from the same canonical parts it would
 * have used. Empirically validated (Felon #19095): an official dressed GLB is
 * exactly the naked-body GLB plus each wearable's standalone GLB merged at
 * identity transforms (the wearable models are authored in gotchi space),
 * with the default mouth node removed when a face wearable is equipped.
 *
 * Composed files are cached on disk and served by /api/gotchi3d/composed.
 */
import { NodeIO, Document } from "@gltf-transform/core";
import { mergeDocuments, prune, dedup, unpartition } from "@gltf-transform/functions";
import fs from "node:fs";
import path from "node:path";

const CDN = "https://dzqjok0x69zbl.cloudfront.net";
const WEARABLE_GLB = (id: number) => `https://dapp.aavegotchi.com/brand/items/3d/${id}.glb`;
const CACHE_DIR = path.join(process.cwd(), "server", "data", "gotchi3d-cache");

// Same shape the frontend derives: <Collateral>-<EyeShape>-<EyeColor>-b-f-e-h-rh-lh-p
export const HASH_RE = /^([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/;

const io = new NodeIO();

async function fetchGlb(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Compose the dressed GLB for a render hash. Returns the cached/composed file
 * path, or null when composition isn't possible (naked body missing, or no
 * equipped wearable has an official model). Wearables without official GLBs
 * (e.g. Base-era ids) are skipped — a partial outfit beats a naked body.
 */
export async function composeGotchiGlb(hash: string): Promise<string | null> {
  const m = HASH_RE.exec(hash);
  if (!m) return null;
  const [, coll, shape, color, ...slotStrs] = m;
  const slots = slotStrs.map(Number); // [body, face, eyes, head, rightHand, leftHand, pet]
  if (!slots.some((s) => s > 0)) return null; // naked: nothing to compose

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const outFile = path.join(CACHE_DIR, `${hash}_GLB.glb`);
  if (fs.existsSync(outFile)) return outFile;

  const nakedHash = `${coll}-${shape}-${color}-0-0-0-0-0-0-0`;
  const nakedBuf = await fetchGlb(`${CDN}/${nakedHash}/${nakedHash}_GLB.glb`);
  if (!nakedBuf) return null;
  const target = await io.readBinary(nakedBuf);

  // Fetch each distinct equipped wearable's model once.
  const ids = [...new Set(slots.filter((s) => s > 0))];
  const parts = new Map<number, Uint8Array>();
  await Promise.all(ids.map(async (id) => {
    const buf = await fetchGlb(WEARABLE_GLB(id));
    if (buf) parts.set(id, buf);
  }));
  if (parts.size === 0) return null; // nothing renderable to add

  // Face wearable replaces the default mouth (verified on official models).
  if (slots[1] > 0 && parts.has(slots[1])) {
    for (const node of target.getRoot().listNodes()) {
      if (/smile|mouth/i.test(node.getName())) node.dispose();
    }
  }

  const targetScene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0];
  const mergeIn = async (buf: Uint8Array, mirrorX: boolean) => {
    const src = await io.readBinary(buf);
    const map = mergeDocuments(target, src);
    for (const scene of src.getRoot().listScenes()) {
      const merged = map.get(scene);
      if (!merged) continue;
      const children = (merged as unknown as typeof scene).listChildren();
      for (const child of children) {
        if (mirrorX) {
          const wrapper = target.createNode(`${child.getName()}_mirror`).setScale([-1, 1, 1]);
          wrapper.addChild(child);
          targetScene?.addChild(wrapper);
        } else {
          targetScene?.addChild(child);
        }
      }
      (merged as unknown as { dispose: () => void }).dispose();
    }
  };

  for (const [i, id] of slots.entries()) {
    if (id <= 0) continue;
    const buf = parts.get(id);
    if (!buf) continue;
    // Same item in both hands: the standalone model is authored for one hand;
    // mirror the second instance across X (slot order here: 4=right, 5=left).
    const bothHandsSame = (i === 5) && slots[4] === slots[5];
    await mergeIn(buf, bothHandsSame);
  }

  // Static display: strip skinning + animations. Some wearable models are
  // skinned, and the merge doesn't preserve their skeletons coherently —
  // three.js then crashes on missing bones ("matrixWorld of undefined").
  // Geometry is authored in the display pose, so dropping skins is lossless
  // for a still model.
  for (const node of target.getRoot().listNodes()) node.setSkin(null);
  for (const mesh of target.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute("JOINTS_0", null);
      prim.setAttribute("WEIGHTS_0", null);
    }
  }
  for (const anim of target.getRoot().listAnimations()) anim.dispose();
  for (const skin of target.getRoot().listSkins()) skin.dispose();

  // unpartition: merged sources each bring a buffer; GLB requires exactly one.
  await target.transform(dedup(), prune(), unpartition());
  const out = await io.writeBinary(target);
  fs.writeFileSync(outFile, out);
  return outFile;
}
