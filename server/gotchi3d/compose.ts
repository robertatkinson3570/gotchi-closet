/**
 * Server-side gotchi 3D composition: builds the dressed model Pixelcraft's
 * offline renderer never generated, from the same canonical parts it would
 * have used.
 *
 * Empirically validated against official dressed GLBs (Felon #19095, Grace
 * Hopper #23881):
 * - Non-hand wearables (body/face/eyes/head/pet) live at identity under the
 *   scene root ("WearableRoot"), exactly matching the standalone wearable
 *   GLBs — plain merges are correct for them.
 * - HAND wearables are different: the standalone GLBs are raw prefab meshes
 *   in arbitrary local spaces (item 212 is a 0.017-unit speck, 217 is
 *   world-authored over the LEFT arm, 315 is upside down at the feet, 386 is
 *   a 2.6-unit rod at the origin). Official models attach them under the
 *   body rig's hand sockets (Melee/Shield/Grenade/Ranged per hand) via a
 *   "Wearable_Mesh_<id>(Clone)" subtree that carries the item-specific
 *   assembly transforms (prefab roots with x100 scale, offsets, rotations).
 *   Those transforms exist ONLY inside official dressed GLBs, so we graft
 *   the clone subtree from a DONOR official render (map built by
 *   scripts/buildHandDonors.ts) into the target's matching socket.
 *
 * Composed files are cached on disk and served by /api/gotchi3d/composed.
 */
import { NodeIO, Document, Node, PropertyType } from "@gltf-transform/core";
import { KHRLightsPunctual, KHRMaterialsEmissiveStrength, KHRMaterialsUnlit, KHRTextureTransform } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { addFireballFlames, buildBasePhone } from "./procedural";

const CDN = "https://dzqjok0x69zbl.cloudfront.net";
const WEARABLE_GLB = (id: number) => `https://dapp.aavegotchi.com/brand/items/3d/${id}.glb`;
// In Docker this MUST point at the persistent volume (set in
// deploy/docker-compose.yml): the default lands inside the container FS and
// every deploy silently wiped the whole mirror + poster cache.
const CACHE_DIR = process.env.GOTCHI3D_CACHE_DIR || path.join(process.cwd(), "server", "data", "gotchi3d-cache");
const DONOR_MAP_FILE = path.join(process.cwd(), "server", "gotchi3d", "hand-donors.json");

// Same shape the frontend derives: <Collateral>-<EyeShape>-<EyeColor>-b-f-e-h-rh-lh-p
export const HASH_RE = /^([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/;

// Register EXACTLY the extensions Pixelcraft's assets use (scanned across
// all cached donors/parts/officials: KHR_texture_transform,
// KHR_materials_emissive_strength, KHR_lights_punctual, KHR_materials_unlit)
// so merged output keeps their material effects — screen glows, tiled
// textures — instead of dropping them. Do NOT register the full
// KHRONOS_EXTENSIONS bundle: it includes compression codecs (Draco, meshopt)
// that require decoders we don't ship, which is what made earlier attempts
// hang (the historical "extensions hang Snoop" verdict).
const io = new NodeIO().registerExtensions([
  KHRTextureTransform,
  KHRMaterialsEmissiveStrength,
  KHRLightsPunctual,
  KHRMaterialsUnlit,
]);

// wearable id -> official dressed render that contains it in a hand socket.
let donorMap: Record<string, { hash: string }> = {};
try {
  donorMap = JSON.parse(fs.readFileSync(DONOR_MAP_FILE, "utf8"));
} catch { /* map not built yet: hand items fall back to plain merges */ }

// Composed outputs are only valid for the pipeline that built them. On boot,
// wipe outputs stamped with a different version (donor-* files are upstream
// content, not pipeline output, and fetchDonorGlb validates them on read).
// Bump on ANY change that alters composed output.
export const PIPELINE_VERSION = "v10";
try {
  const stamp = path.join(CACHE_DIR, ".pipeline-version");
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8").trim() !== PIPELINE_VERSION) {
    if (fs.existsSync(CACHE_DIR)) {
      for (const f of fs.readdirSync(CACHE_DIR)) {
        // official-* mirrors are upstream content (pipeline-independent);
        // composed GLBs and generated posters are pipeline output.
        const composedGlb = f.endsWith("_GLB.glb") && !f.startsWith("donor-") && !f.startsWith("official-");
        const generatedPoster = f.startsWith("gen-") && f.endsWith("_Card.png");
        if (composedGlb || generatedPoster) fs.rmSync(path.join(CACHE_DIR, f), { force: true });
      }
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(stamp, PIPELINE_VERSION);
    console.log(`[gotchi3d] composed cache purged for pipeline ${PIPELINE_VERSION}`);
  }
} catch (e) {
  console.error("[gotchi3d] cache version check failed", e);
}

/** A real GLB starts with the ASCII magic "glTF"; the CDN's error responses
 *  don't. Never cache or graft from an error body. */
export function isGlb(buf: Uint8Array): boolean {
  return buf.length > 12 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46;
}

export { CACHE_DIR as GOTCHI3D_CACHE_DIR };

/** Hashes holding the Fireball (130): Pixelcraft's OWN renders show it as a
 *  bald translucent sphere (their flame effect never survived export), so
 *  the official render is the degraded one — these always compose, where
 *  procedural.ts builds the real flames. */
export function hasBaldFireball(hash: string): boolean {
  const m = HASH_RE.exec(hash);
  if (!m) return false;
  const slots = m.slice(4).map(Number);
  return slots[4] === 130 || slots[5] === 130;
}

/** Already-composed model for a hash, disk only — never composes. */
export function composedModelOnDisk(hash: string): string | null {
  const file = path.join(CACHE_DIR, `${hash}_GLB.glb`);
  return fs.existsSync(file) ? file : null;
}

// Composing runs gltf-transform's CPU passes (texture resize, weld) — pure
// JS that blocks the event loop for tens of seconds. In-process composing
// froze the whole API while the prewarm ran (measured 57s TTFB on a
// disk-warm poster). ALL callers go through this child-process wrapper; the
// in-process composeGotchiGlb is only invoked by compose-cli.ts.
const detachLimit = pLimit(2); // ~half the VPS cores; leaves room for renders + serving
const detachInFlight = new Map<string, Promise<string | null>>();

export function composeGotchiGlbDetached(hash: string): Promise<string | null> {
  const disk = composedModelOnDisk(hash);
  if (disk) return Promise.resolve(disk);
  let job = detachInFlight.get(hash);
  if (!job) {
    job = detachLimit(
      () =>
        new Promise<string | null>((resolve) => {
          const child = spawn(
            process.execPath,
            [path.join("node_modules", "tsx", "dist", "cli.mjs"), path.join("server", "gotchi3d", "compose-cli.ts"), hash],
            { cwd: process.cwd(), stdio: ["ignore", "ignore", "inherit"], timeout: 5 * 60_000 },
          );
          child.on("exit", () => resolve(composedModelOnDisk(hash)));
          child.on("error", (e) => {
            console.error(`[gotchi3d] compose child failed to spawn for ${hash}`, e);
            resolve(null);
          });
        }),
    ).finally(() => detachInFlight.delete(hash));
    detachInFlight.set(hash, job);
  }
  return job;
}

// Distinguishes "the CDN says this asset doesn't exist" (a definitive answer,
// safe to bake into a cached composed file) from a transient failure (timeout,
// network blip, junk body). A compose that hit a transient failure must NOT be
// cached, or the incomplete model gets served forever (seen in prod: gotchis
// missing an eye wearable permanently after one flaky fetch). PER-COMPOSE
// state, threaded through explicitly: composes run concurrently (a grid fires
// dozens at once), so a module-global flag would cross-contaminate them — and
// one compose resetting it mid-run of another would re-open the cache hole.
type ComposeCtx = { transientFailure: boolean };

async function fetchGlb(url: string, ctx: ComposeCtx): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null; // 403/404: asset genuinely absent upstream
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!isGlb(buf)) {
      ctx.transientFailure = true; // 200 with junk body (flaky proxy)
      return null;
    }
    return buf;
  } catch {
    ctx.transientFailure = true; // timeout / network error
    return null;
  }
}

/** Donor GLBs are ~5-8 MB; cache them on disk beside the composed output. */
async function fetchDonorGlb(hash: string, ctx: ComposeCtx): Promise<Uint8Array | null> {
  const file = path.join(CACHE_DIR, `donor-${hash}_GLB.glb`);
  if (fs.existsSync(file)) return new Uint8Array(fs.readFileSync(file));
  const buf = await fetchGlb(`${CDN}/${hash}/${hash}_GLB.glb`, ctx);
  if (!buf) {
    ctx.transientFailure = true; // donors are known-good renders; absence is transient
    return null;
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return buf;
}

/** Standalone wearable GLBs, disk-cached: a full-collection prewarm would
 *  otherwise re-download the same ~300 items thousands of times — and the
 *  cache doubles as our archive of them should Pixelcraft's CDN go dark. */
async function fetchPartGlb(id: number, ctx: ComposeCtx): Promise<Uint8Array | null> {
  const file = path.join(CACHE_DIR, `part-${id}.glb`);
  if (fs.existsSync(file)) return new Uint8Array(fs.readFileSync(file));
  const buf = await fetchGlb(WEARABLE_GLB(id), ctx);
  if (!buf) return null;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return buf;
}

/** Pixelcraft's rig spells the left shield socket "SheildSocket_L". */
const normSocket = (name: string) => name.replace(/sheild/gi, "Shield");
const SOCKET_RE = /^(Melee|Sheild|Shield|Grenade|Ranged)Socket_(L|R)$/i;

type CloneHit =
  | { kind: "socket"; node: Node; parent: Node; socketType: string; side: "L" | "R" }
  | { kind: "root"; node: Node; parent: Node };

/**
 * Find every "Wearable_Mesh_<id>(Clone)" in a donor. Hand items come in two
 * official flavors: rigid props under a hand socket (laptops, wands, signs)
 * and skinned world-authored pieces under WearableRoot at identity (gloves,
 * arm covers — same placement scheme as body wearables).
 */
function findHandClones(doc: Document, id: number): CloneHit[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const hits: CloneHit[] = [];
  const wanted = `Wearable_Mesh_${id}(Clone)`;
  const walk = (node: Node, ancestors: Node[]) => {
    if (node.getName() === wanted && ancestors.length > 0) {
      const parent = ancestors[ancestors.length - 1];
      let socketed = false;
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const m = SOCKET_RE.exec(ancestors[i].getName() ?? "");
        if (m) {
          hits.push({ kind: "socket", node, parent, socketType: normSocket(m[1]), side: m[2].toUpperCase() as "L" | "R" });
          socketed = true;
          break;
        }
      }
      if (!socketed) hits.push({ kind: "root", node, parent });
    }
    for (const c of node.listChildren()) walk(c, [...ancestors, node]);
  };
  for (const c of scene?.listChildren() ?? []) walk(c, []);
  return hits;
}

/** The target body's socket of the given type on the given hand. */
function findTargetSocket(doc: Document, socketType: string, side: "L" | "R"): Node | null {
  for (const node of doc.getRoot().listNodes()) {
    const m = SOCKET_RE.exec(node.getName() ?? "");
    if (m && normSocket(m[1]).toLowerCase() === socketType.toLowerCase() && m[2].toUpperCase() === side) return node;
  }
  return null;
}

function disposeTree(node: Node) {
  for (const c of node.listChildren()) disposeTree(c);
  node.dispose();
}

/**
 * Flip triangle winding for every mesh under a node. Required after a
 * negative-scale (mirror) wrapper: mirroring alone flips the winding order,
 * so the mesh gets backface-culled and renders invisible.
 */
function reverseWinding(node: Node) {
  const seen = new Set<unknown>();
  const walk = (n: Node) => {
    const mesh = n.getMesh();
    if (mesh && !seen.has(mesh)) {
      seen.add(mesh);
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        const arr = idx?.getArray();
        if (idx && arr) {
          for (let i = 0; i + 2 < arr.length; i += 3) {
            const t = arr[i + 1];
            arr[i + 1] = arr[i + 2];
            arr[i + 2] = t;
          }
          idx.setArray(arr);
        }
      }
    }
    for (const c of n.listChildren()) walk(c);
  };
  walk(node);
}

/** Which contract hand (R/L) holds `id` in a donor's render hash. */
function donorContractSide(hash: string, id: number): "R" | "L" | null {
  const m = HASH_RE.exec(hash);
  if (!m) return null;
  const slots = m.slice(4).map(Number);
  if (slots[4] === id) return "R";
  if (slots[5] === id) return "L";
  return null;
}

/**
 * Manual assembly for items with NO official render anywhere on the CDN
 * (nothing to donor-graft from). The standalone GLB is placed under a hand
 * socket with a hand-tuned adjustment, mirroring how analog items are
 * assembled in official models (reference: Spirit Sword 311 sits in
 * MeleeSocket with the grip near the socket origin and the blade up +Y).
 */
const MANUAL_HAND_ASSEMBLY: Record<number, {
  socketType: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: number;
  /** Procedurally authored mesh (no 3D source art exists at all). */
  build?: (doc: Document) => Node;
}> = {
  // Haanzo Katana (godlike, Kabuto/Yoroi set): its standalone GLB's own node
  // transform (180° X flip + x10 scale) already yields blade-up +Y with the
  // grip near the origin — the same socket-space pose Spirit Sword uses.
  315: { socketType: "Melee" },
  // Based Phone: Base-era wearable (418+ have no 3D source art anywhere).
  // Procedurally authored in procedural.ts, gripped like a held slab. The
  // socket's +Z points into the body — half-turn so the screen faces out.
  419: { socketType: "Melee", build: buildBasePhone, rotation: [0, 1, 0, 0] },
};

/** Place a donor-less item's standalone GLB into a hand socket by hand. */
async function graftManualHandWearable(target: Document, id: number, side: "L" | "R", ctx: ComposeCtx): Promise<"socket" | null> {
  const manual = MANUAL_HAND_ASSEMBLY[id];
  if (!manual) return null;
  const socket = findTargetSocket(target, manual.socketType, side);
  if (!socket) return null;
  const holder = target.createNode(`Wearable_Mesh_${id}(Manual)`);
  if (manual.translation) holder.setTranslation(manual.translation);
  if (manual.rotation) holder.setRotation(manual.rotation);
  if (manual.scale) holder.setScale([manual.scale, manual.scale, manual.scale]);
  if (manual.build) {
    holder.addChild(manual.build(target));
  } else {
    const buf = await fetchPartGlb(id, ctx);
    if (!buf) { holder.dispose(); return null; }
    const src = await io.readBinary(buf);
    const map = mergeDocuments(target, src);
    for (const scene of src.getRoot().listScenes()) {
      const mergedScene = map.get(scene);
      if (!mergedScene) continue;
      for (const child of [...(mergedScene as unknown as typeof scene).listChildren()]) holder.addChild(child);
      (mergedScene as unknown as { dispose: () => void }).dispose();
    }
  }
  socket.addChild(holder);
  return "socket";
}

/**
 * Graft the donor's assembled hand-wearable subtree into the target: socketed
 * props go into the matching hand socket, WearableRoot-style pieces go to the
 * scene root at identity (their whole donor chain is identity transforms).
 * Returns how the item was placed, or null when it couldn't be.
 */
async function graftHandWearable(target: Document, id: number, side: "L" | "R", ctx: ComposeCtx, contractSide?: "R" | "L"): Promise<"socket" | "root" | null> {
  const donor = donorMap[String(id)];
  if (!donor) return graftManualHandWearable(target, id, side, ctx);
  const buf = await fetchDonorGlb(donor.hash, ctx);
  if (!buf) return graftManualHandWearable(target, id, side, ctx);
  const src = await io.readBinary(buf);
  const clones = findHandClones(src, id);
  // A donor can EXIST yet not contain the item: Pixelcraft's farm rendered
  // hashes with Base-era items by silently omitting them (verified: the 419
  // donor GLB has no Wearable_Mesh_419). Manual/procedural assembly is the
  // fallback, not a dead end.
  if (clones.length === 0) return graftManualHandWearable(target, id, side, ctx);
  // Prefer the donor instance already on the hand we need (the clone's inner
  // Left/RightHandRoot transforms differ slightly per side).
  const pick = clones.find((c) => c.kind === "socket" && c.side === side) ?? clones[0];

  const map = mergeDocuments(target, src);
  const mergedClone = map.get(pick.node) as Node | undefined;
  const mergedParent = map.get(pick.parent) as Node | undefined;
  if (!mergedClone) return null;
  mergedParent?.removeChild(mergedClone);

  // Drop the rest of the donor gotchi (detached clone survives; prune() then
  // sweeps the donor's now-unused meshes/materials/textures). The donor's
  // Scene objects must go too or the output accumulates empty scenes.
  for (const scene of src.getRoot().listScenes()) {
    const mergedScene = map.get(scene);
    if (!mergedScene) continue;
    for (const child of (mergedScene as unknown as typeof scene).listChildren()) {
      if (child !== mergedClone) disposeTree(child);
    }
    (mergedScene as unknown as { dispose: () => void }).dispose();
  }

  const targetScene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0];

  if (pick.kind === "root") {
    if (!targetScene) {
      disposeTree(mergedClone);
      return null;
    }
    // Preserve the donor parent's WORLD placement: pets hang off a PetRoot
    // node that carries the beside-the-gotchi offset (e.g. t=[1.15,0,1.27]);
    // dropping it leaves the pet hidden inside the body. WearableRoot pieces
    // have an identity chain, so the wrapper is a no-op for them.
    const wrapper = target.createNode(`${pick.parent.getName() || "graft"}_placement`);
    wrapper.setMatrix(pick.parent.getWorldMatrix());
    wrapper.addChild(mergedClone);
    targetScene.addChild(wrapper);
    // Rooted hand pieces are ONE-SIDED baked meshes (e.g. 217 Energy Gun is
    // authored on the gotchi's left arm). When the target wears it on the
    // OTHER contract hand than the donor did, mirror across X and flip the
    // triangle winding (negative scale alone renders backface-culled).
    const dSide = contractSide ? donorContractSide(donor.hash, id) : null;
    if (contractSide && dSide && dSide !== contractSide) {
      const mirror = target.createNode(`${pick.node.getName() || "graft"}_mirror`).setScale([-1, 1, 1]);
      wrapper.removeChild(mergedClone);
      mirror.addChild(mergedClone);
      wrapper.addChild(mirror);
      reverseWinding(mergedClone);
    }
    return "root";
  }

  const socket = findTargetSocket(target, pick.socketType, side);
  if (!socket) {
    disposeTree(mergedClone);
    return null;
  }
  socket.addChild(mergedClone);

  // Donor had the item on the other hand: the clone ships BOTH Left/Right
  // HandRoot locators (side transforms baked, mesh under the donor's side),
  // so re-hang the mesh under the locator for the hand we're dressing.
  if (pick.side !== side) {
    const donorRoot = mergedClone.listChildren().find((c) => c.getName() === `${pick.side === "L" ? "Left" : "Right"}HandRoot`);
    const wantRoot = mergedClone.listChildren().find((c) => c.getName() === `${side === "L" ? "Left" : "Right"}HandRoot`);
    if (donorRoot && wantRoot) {
      for (const c of [...donorRoot.listChildren()]) wantRoot.addChild(c);
    }
  }
  return "socket";
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
  // Naked gotchis compose too: when Pixelcraft never rendered the exact
  // naked body, a sibling body (below) IS the model — bailing here left
  // whole eye-shape/color combos permanently 2D (e.g. The Great Freeze
  // #10170, Aave-MythicalLow1_H2-Uncommon_Low).
  const isNaked = !slots.some((s) => s > 0);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const outFile = path.join(CACHE_DIR, `${hash}_GLB.glb`);
  if (fs.existsSync(outFile)) return outFile;
  const ctx: ComposeCtx = { transientFailure: false };

  // Naked body. When the exact hash was never rendered by Pixelcraft, fall
  // back to an eye-COLOR sibling (same collateral + eye shape): eye color
  // only tints the iris, and a slightly-off tint beats never rendering in 3D
  // (e.g. Jo #9369: only the Rare_High variant of its body exists).
  const EYE_COLORS = ["Mythical_Low", "Rare_Low", "Uncommon_Low", "Common", "Uncommon_High", "Rare_High", "Mythical_High"];
  // Mythical-low eye shapes: traits 0 and 1 are the SAME haunt-specific
  // shape in 2D, but the render farm named its output MythicalLow1_HX or
  // MythicalLow2_HX depending on the trait value and rendered the variants
  // patchily per collateral (verified on the CDN: USDC has 1_H2 only in
  // Rare_High, Aave has only 2_H2). The other variant digit is therefore a
  // pixel-identical fallback body.
  const shapeSiblings = [shape];
  const mythLow = shape.match(/^MythicalLow([12])(_H[12])$/);
  if (mythLow) shapeSiblings.push(`MythicalLow${mythLow[1] === "1" ? "2" : "1"}${mythLow[2]}`);
  let nakedBuf: Uint8Array | null = null;
  outer: for (const c of [color, ...EYE_COLORS.filter((x) => x !== color)]) {
    for (const s of shapeSiblings) {
      const nakedHash = `${coll}-${s}-${c}-0-0-0-0-0-0-0`;
      const buf = await fetchGlb(`${CDN}/${nakedHash}/${nakedHash}_GLB.glb`, ctx);
      if (buf && isGlb(buf)) { nakedBuf = buf; break outer; }
    }
  }
  if (!nakedBuf) return null;
  const target = await io.readBinary(nakedBuf);

  // Hand slots first: graft each from its donor official render. Hash slot
  // order is body-face-eyes-head-RIGHT-LEFT-pet. SIDE MAPPING (verified on
  // Felon #19095's official GLB + 2D art): the contract/hash RIGHT-hand item
  // is physically mounted on the rig's Hand_L (and appears on the viewer's
  // right, matching where the 2D SVG draws it), and vice versa.
  const handSides: Array<[number, "R" | "L", "R" | "L"]> = [[slots[4], "L", "R"], [slots[5], "R", "L"]];
  let placedAnything = false;
  const rootGrafted = new Set<number>(); // WearableRoot pieces: once, not per hand
  for (const [id, side, contractSide] of handSides) {
    if (id <= 0 || rootGrafted.has(id)) continue;
    const placed = await graftHandWearable(target, id, side, ctx, contractSide);
    if (placed) placedAnything = true;
    if (placed === "root") rootGrafted.add(id);
  }

  // Pet (slot 6): standalone pet GLBs are authored CENTERED AT THE ORIGIN —
  // root-merged they render hidden inside the gotchi's body. Official models
  // position pets via the PetRoot clone subtree (e.g. the Godlike Cacti rig
  // sits at x≈±1.1), so pets donor-graft exactly like hand props; the plain
  // merge below stays as the no-donor fallback.
  let petGrafted = false;
  if (slots[6] > 0) {
    petGrafted = (await graftHandWearable(target, slots[6], "L", ctx)) !== null;
    if (petGrafted) placedAnything = true;
  }

  // Fireball (130): wrap the grafted bald sphere (Pixelcraft's flame was a
  // Unity particle effect that never survived export) in authored flame
  // shells — see procedural.ts.
  if (slots.includes(130)) addFireballFlames(target);

  // Body/face/eyes/head items whose STANDALONE GLB is known-degraded (e.g.
  // 368 Beard of Divinity ships with no texture at all and renders flat
  // white; the official dressed models carry the real material) graft from
  // their donor render instead of merging the standalone.
  const PREFER_DONOR_SLOTS = new Set([368]);
  const donorGraftedSlots = new Set<number>();
  for (const i of [0, 1, 2, 3]) {
    const id = slots[i];
    if (id <= 0 || !PREFER_DONOR_SLOTS.has(id) || donorGraftedSlots.has(id)) continue;
    if (await graftHandWearable(target, id, "L", ctx)) {
      donorGraftedSlots.add(id);
      placedAnything = true;
    }
  }

  // Everything else merges as authored. Hand items WITHOUT a donor are
  // skipped outright: their standalone GLBs are unassembled prefab meshes
  // (wrong scale/position/rotation), and a missing item beats a floating
  // artifact. They self-heal into official renders once Pixelcraft's
  // generator is back (the frontend already queues kicks).
  const fallbackIds = new Set<number>();
  for (const [i, id] of slots.entries()) {
    if (id <= 0) continue;
    if (i === 4 || i === 5) continue; // hand slots: donor graft only
    if (i === 6 && petGrafted) continue; // pet already placed via donor
    if (donorGraftedSlots.has(id)) continue;
    fallbackIds.add(id);
  }
  const parts = new Map<number, Uint8Array>();
  await Promise.all([...fallbackIds].map(async (id) => {
    const buf = await fetchPartGlb(id, ctx);
    if (buf) parts.set(id, buf);
  }));
  // A dressed gotchi with zero renderable parts stays null (a naked model
  // under a dressed hash would violate "never show naked for dressed").
  // A genuinely naked gotchi proceeds: the sibling body IS the render.
  if (!isNaked && !placedAnything && parts.size === 0) return null;

  // The mouth is NEVER removed for face wearables: official renders keep
  // every mouth node even under full-coverage items (verified on Slide's
  // official with Beard of Divinity 368 AND on Dai-...-157: Mouth, Smile_low,
  // Smile_low_default, Mouth_M all present). An earlier blanket removal here
  // produced mouthless gotchis for forehead-style face items (#15327).

  const targetScene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0];

  // Merge every non-hand part EXACTLY as authored, no transforms. Ground
  // truth: in official dressed GLBs the non-hand wearables sit at identity
  // under the scene root, byte-identical to the standalone GLBs. fallbackIds
  // is a Set, so an item repeated across slots merges once (duplicating in
  // place just z-fights).
  for (const id of fallbackIds) {
    const buf = parts.get(id);
    if (!buf) continue;
    const src = await io.readBinary(buf);
    const map = mergeDocuments(target, src);
    for (const scene of src.getRoot().listScenes()) {
      const mergedScene = map.get(scene);
      if (!mergedScene) continue;
      const children = (mergedScene as unknown as typeof scene).listChildren();
      for (const child of children) targetScene?.addChild(child);
      (mergedScene as unknown as { dispose: () => void }).dispose();
    }
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

  // Drop stray meshes authored far outside the display envelope (the Wizard
  // Hat 63 ships a "MagicDust" particle mesh ~10 units below the floor).
  // They're harmless in Pixelcraft's fixed-camera renders but wreck
  // model-viewer's auto-framing: the camera zooms out to fit them and the
  // gotchi renders tiny. Only meshes ENTIRELY outside the envelope go.
  const ENV_MIN = [-3.5, -0.75, -3.5];
  const ENV_MAX = [3.5, 4.5, 3.5];
  for (const node of target.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const wm = node.getWorldMatrix();
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const mn = pos.getMin([]);
      const mx = pos.getMax([]);
      for (const c of [[mn[0], mn[1], mn[2]], [mn[0], mn[1], mx[2]], [mn[0], mx[1], mn[2]], [mn[0], mx[1], mx[2]], [mx[0], mn[1], mn[2]], [mx[0], mn[1], mx[2]], [mx[0], mx[1], mn[2]], [mx[0], mx[1], mx[2]]]) {
        const w = [
          wm[0] * c[0] + wm[4] * c[1] + wm[8] * c[2] + wm[12],
          wm[1] * c[0] + wm[5] * c[1] + wm[9] * c[2] + wm[13],
          wm[2] * c[0] + wm[6] * c[1] + wm[10] * c[2] + wm[14],
        ];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
      }
    }
    const outside = min[0] > ENV_MAX[0] || min[1] > ENV_MAX[1] || min[2] > ENV_MAX[2]
      || max[0] < ENV_MIN[0] || max[1] < ENV_MIN[1] || max[2] < ENV_MIN[2];
    if (outside) node.setMesh(null);
  }

  // MATERIAL REPAIR: a few wearables ship with broken material exports.
  // Beard of Divinity (368) has NO texture and metallic=1/roughness=1 —
  // renders as flat white plastic while the official poster shows grey
  // strandy hair. Its meshes DO have UVs, so give it our authored hair-
  // strand texture and sane dielectric factors. Applies to any material
  // named Beard_of_divinity* that lacks a base color texture.
  for (const mat of target.getRoot().listMaterials()) {
    if (!/beard_of_divinity/i.test(mat.getName() ?? "") || mat.getBaseColorTexture()) continue;
    try {
      const bytes = fs.readFileSync(path.join(process.cwd(), "server", "gotchi3d", "assets", "beard-strands.png"));
      const tex = target.createTexture("BeardStrands").setImage(new Uint8Array(bytes)).setMimeType("image/png");
      mat.setBaseColorTexture(tex)
        .setBaseColorFactor([0.92, 0.9, 0.88, 1])
        .setMetallicFactor(0)
        .setRoughnessFactor(0.6);
    } catch { /* texture asset missing: leave the material as shipped */ }
  }

  // FRAME ANCHOR: two zero-area (invisible) triangles pinning the scene's
  // bounding box to y in [-0.84, 3.6]: sized so typical content (feet 0 to hat crown ~2.75) renders at ~65% of the frame, the margin measured in Pixelcraft posters.13 = box center, so the gotchi sits centered like the posters). Viewers auto-frame to scene bounds, so
  // without this a petless gotchi fills its card while one with accessories
  // shrinks. Anchored, every composed gotchi's body renders at ~65% of the
  // frame — measured equal to Pixelcraft's own poster framing (their posters
  // are body-locked: b00bs 0.661, Immaterial 0.646 content height). Camera-
  // side fixes were abandoned: model-viewer silently clamps/ignores absolute
  // orbit radii per model (verified: identical output at 9/10/11m).
  {
    const anchorPos = target.createAccessor("FrameAnchorPos")
      .setType("VEC3")
      .setArray(new Float32Array([
        0, -0.84, 0, 0, -0.84, 0, 0, -0.84, 0,
        0, 3.6, 0, 0, 3.6, 0, 0, 3.6, 0,
      ]));
    const prim = target.createPrimitive().setAttribute("POSITION", anchorPos);
    const anchorMesh = target.createMesh("FrameAnchor").addPrimitive(prim);
    const anchorNode = target.createNode("FrameAnchor").setMesh(anchorMesh);
    targetScene?.addChild(anchorNode);
  }

  // Size pass (grid cards load a dozen of these; bytes are the loading
  // bottleneck): texture-only dedup collapses the duplicated images that
  // both-hands grafts bring (the historical dedup crash came from node/skin
  // dedup, so ONLY textures are deduped); weld+quantize roughly halve the
  // geometry bytes via KHR_mesh_quantization, which model-viewer decodes
  // natively. unpartition: merged sources each bring a buffer; GLB requires
  // exactly one.
  // textureCompress without an encoder still resizes (pure-JS ndarray path):
  // donors ship 2K normal/albedo maps that dwarf everything else; 1K is
  // indistinguishable at card/modal sizes and roughly halves the file again.
  // NO quantize(): it produced GLBs that hang three.js on some combos
  // (verified: Immaterial #16559's composed model never fired load with it,
  // loads instantly without). Texture resize is the bulk of the size win.
  await target.transform(
    prune(),
    dedup({ propertyTypes: [PropertyType.TEXTURE] }),
    weld(),
    textureCompress({ resize: [2048, 2048] }),
    unpartition(),
  );
  const out = await io.writeBinary(target);
  // A compose that hit a transient fetch failure may be missing parts: serve
  // it (better than nothing right now) but do NOT cache it, so the next
  // request retries the full composition.
  if (ctx.transientFailure) {
    const serveOnce = path.join(CACHE_DIR, `${hash}_GLB.partial.glb`);
    fs.writeFileSync(serveOnce, out);
    return serveOnce;
  }
  // Atomic write: a process killed mid-write must never leave a corrupt GLB
  // that then gets served from cache forever.
  const tmp = `${outFile}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, outFile);
  return outFile;
}
