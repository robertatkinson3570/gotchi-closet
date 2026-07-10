/**
 * Procedurally authored wearable art, built directly into the compose target
 * at graft time (no asset files, fully deterministic):
 *
 * - Fireball (130): every 3D export Pixelcraft left behind renders it as a
 *   bald translucent sphere — their flame was a Unity particle effect that
 *   never survived export. We keep the grafted sphere as the ember core and
 *   wrap it in stylized cartoon flame shells.
 * - Based Phone (419): Base-era wearables (418+) shipped AFTER the render
 *   farm died — no official render contains them and no standalone GLB was
 *   ever exported. Authored from scratch to match the 2D sprite: Base-blue
 *   slab, bright screen, Base logo mark.
 *
 * Everything is unlit (flat toon shading, matching the game's look).
 */
import { Document, Material, Node } from "@gltf-transform/core";
import { KHRMaterialsUnlit } from "@gltf-transform/extensions";

type Vec3 = [number, number, number];

function unlitMat(doc: Document, name: string, rgba: [number, number, number, number]): Material {
  const mat = doc.createMaterial(name).setBaseColorFactor(rgba).setDoubleSided(true);
  if (rgba[3] < 1) mat.setAlphaMode("BLEND");
  mat.setExtension("KHR_materials_unlit", doc.createExtension(KHRMaterialsUnlit).createUnlit());
  return mat;
}

function meshNode(doc: Document, name: string, positions: Float32Array, indices: Uint16Array, material: Material): Node {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const pos = doc.createAccessor(`${name}-pos`).setType("VEC3").setArray(positions).setBuffer(buffer);
  const idx = doc.createAccessor(`${name}-idx`).setType("SCALAR").setArray(indices).setBuffer(buffer);
  const prim = doc.createPrimitive().setMode(4).setAttribute("POSITION", pos).setIndices(idx).setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  return doc.createNode(name).setMesh(mesh);
}

/**
 * Revolve a flame profile around +Y. `wiggle` bends the upper body/tip
 * sideways for the classic licking-flame silhouette instead of a static
 * teardrop; `phase` varies it per shell.
 */
function flameShell(doc: Document, name: string, R: number, H: number, phase: number, material: Material): Node {
  const rows = 20;
  const segs = 22;
  const positions = new Float32Array((rows + 1) * (segs + 1) * 3);
  let p = 0;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // Teardrop: full-bellied low, tapering to a point.
    const radius = R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 1.15) * (1 - 0.85 * Math.pow(t, 6));
    const y = H * t;
    const bendX = R * 0.34 * Math.sin(4.4 * t + phase) * Math.pow(t, 1.7);
    const bendZ = R * 0.18 * Math.sin(3.1 * t + phase * 1.7) * Math.pow(t, 2.2);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      positions[p++] = Math.cos(a) * radius + bendX;
      positions[p++] = y;
      positions[p++] = Math.sin(a) * radius + bendZ;
    }
  }
  const indices = new Uint16Array(rows * segs * 6);
  let q = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices[q++] = a; indices[q++] = b; indices[q++] = a + 1;
      indices[q++] = a + 1; indices[q++] = b; indices[q++] = b + 1;
    }
  }
  return meshNode(doc, name, positions, indices, material);
}

/** Axis-aligned box centered at `center`. */
function boxAt(doc: Document, name: string, center: Vec3, size: Vec3, material: Material): Node {
  const [cx, cy, cz] = center;
  const [w, h, d] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const corners: Vec3[] = [
    [cx - w, cy - h, cz - d], [cx + w, cy - h, cz - d], [cx + w, cy + h, cz - d], [cx - w, cy + h, cz - d],
    [cx - w, cy - h, cz + d], [cx + w, cy - h, cz + d], [cx + w, cy + h, cz + d], [cx - w, cy + h, cz + d],
  ];
  const positions = new Float32Array(corners.flat());
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, // back
    4, 5, 6, 4, 6, 7, // front
    0, 1, 5, 0, 5, 4, // bottom
    3, 6, 2, 3, 7, 6, // top
    0, 4, 7, 0, 7, 3, // left
    1, 2, 6, 1, 6, 5, // right
  ]);
  return meshNode(doc, name, positions, indices, material);
}

/** Flat disc facing +Z. */
function discAt(doc: Document, name: string, center: Vec3, r: number, material: Material): Node {
  const segs = 28;
  const positions = new Float32Array((segs + 2) * 3);
  positions[0] = center[0]; positions[1] = center[1]; positions[2] = center[2];
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    positions[(j + 1) * 3] = center[0] + Math.cos(a) * r;
    positions[(j + 1) * 3 + 1] = center[1] + Math.sin(a) * r;
    positions[(j + 1) * 3 + 2] = center[2];
  }
  const indices = new Uint16Array(segs * 3);
  for (let j = 0; j < segs; j++) {
    indices[j * 3] = 0; indices[j * 3 + 1] = j + 1; indices[j * 3 + 2] = j + 2;
  }
  return meshNode(doc, name, positions, indices, material);
}

// ---------------------------------------------------------------------------
// Fireball (130)
// ---------------------------------------------------------------------------

/** Subtree bounds in `node`'s own frame (children's transforms applied,
 *  node's own transform NOT — shells added as children share that frame). */
function localBounds(node: Node): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const mul = (m: number[], v: Vec3): Vec3 => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
  const matMul = (a: number[], b: number[]): number[] => {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return out;
  };
  const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const walk = (n: Node, parent: number[], includeSelf: boolean) => {
    const m = includeSelf ? matMul(parent, Array.from(n.getMatrix())) : parent;
    const mesh = n.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute("POSITION");
        if (!posAcc) continue;
        const lo = posAcc.getMin([0, 0, 0]) as Vec3;
        const hi = posAcc.getMax([0, 0, 0]) as Vec3;
        for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
          const w = mul(m, [x, y, z]);
          for (let k = 0; k < 3; k++) {
            if (w[k] < min[k]) min[k] = w[k];
            if (w[k] > max[k]) max[k] = w[k];
          }
        }
      }
    }
    for (const c of n.listChildren()) walk(c, m, true);
  };
  walk(node, IDENT, false);
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** Lat/long sphere with deterministic turbulent radial displacement — the
 *  "boiling fire" surface. disp=0 gives a plain sphere. */
function noisySphere(doc: Document, name: string, R: number, disp: number, phase: number, material: Material): Node {
  const rows = 24;
  const segs = 28;
  const noise = (x: number, y: number, z: number) =>
    Math.sin(4.9 * x + 1.3 + phase) * Math.sin(4.1 * y + 2.7 + phase * 1.6) +
    0.55 * Math.sin(7.3 * z + 0.9 - phase) * Math.sin(6.1 * x - 1.1 + phase * 0.7);
  const positions = new Float32Array((rows + 1) * (segs + 1) * 3);
  let p = 0;
  for (let i = 0; i <= rows; i++) {
    const v = (i / rows) * Math.PI;
    for (let j = 0; j <= segs; j++) {
      const u = (j / segs) * Math.PI * 2;
      let nx = Math.sin(v) * Math.cos(u);
      let ny = Math.cos(v);
      let nz = Math.sin(v) * Math.sin(u);
      // Seam (j=0 vs j=segs) must displace identically; noise is position-based, so it does.
      const rr = R * (1 + disp * 0.5 * noise(nx, ny, nz));
      // Fire rises: stretch the upper hemisphere upward a touch.
      const lift = ny > 0 ? 1 + 0.22 * ny : 1;
      positions[p++] = nx * rr;
      positions[p++] = ny * rr * lift;
      positions[p++] = nz * rr;
    }
  }
  const indices = new Uint16Array(rows * segs * 6);
  let q = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices[q++] = a; indices[q++] = b; indices[q++] = a + 1;
      indices[q++] = a + 1; indices[q++] = b; indices[q++] = b + 1;
    }
  }
  return meshNode(doc, name, positions, indices, material);
}

/** Quaternion rotating +Y onto direction d (normalized). */
function quatFromUp(d: Vec3): [number, number, number, number] {
  const [x, y, z] = d;
  const dot = y; // dot([0,1,0], d)
  if (dot > 0.9999) return [0, 0, 0, 1];
  if (dot < -0.9999) return [1, 0, 0, 0];
  const ax = z, ay = 0, az = -x; // cross([0,1,0], d)
  const len = Math.hypot(ax, ay, az);
  const half = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
  const s = Math.sin(half) / len;
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

/**
 * Replace every grafted fireball's look: the donor "fireball" is a bald
 * translucent sphere (Pixelcraft's flame was a Unity particle effect that
 * never survived export). Build a proper ball of fire over it — molten
 * near-white core, two boiling displaced fire shells, and a crown of
 * licking flame tongues, all flat-toon unlit. Matches nodes the graft named
 * Wearable_Mesh_130(...).
 */
export function addFireballFlames(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    if (!/^Wearable_Mesh_130\(/.test(node.getName())) continue;
    if (node.listChildren().some((c) => c.getName() === "FireballFlames")) continue;
    const b = localBounds(node);
    if (!b) continue;
    const center: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const r = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
    if (r <= 0) continue;

    const holder = doc.createNode("FireballFlames").setTranslation(center);
    const coreMat = unlitMat(doc, "FireCore", [1.0, 0.96, 0.62, 1.0]);
    const midMat = unlitMat(doc, "FireMid", [1.0, 0.55, 0.04, 0.92]);
    const outerMat = unlitMat(doc, "FireOuter", [1.0, 0.22, 0.0, 0.5]);
    const tongueMatA = unlitMat(doc, "FireTongueA", [1.0, 0.45, 0.02, 0.85]);
    const tongueMatB = unlitMat(doc, "FireTongueB", [1.0, 0.68, 0.08, 0.9]);

    // The ball of fire: opaque molten core swallows the donor sphere, two
    // turbulent translucent shells boil around it.
    holder.addChild(noisySphere(doc, "FireCoreBall", r * 1.06, 0.06, 0.0, coreMat));
    holder.addChild(noisySphere(doc, "FireMidBall", r * 1.24, 0.22, 1.9, midMat));
    holder.addChild(noisySphere(doc, "FireOuterBall", r * 1.45, 0.34, 4.2, outerMat));

    // Crown of licking tongues over the upper hemisphere + one big top flame.
    holder.addChild(flameShell(doc, "FireTongueTop", r * 0.5, r * 2.3, 0.8, tongueMatB).setTranslation([0, r * 0.75, 0]));
    const tongues = 6;
    for (let k = 0; k < tongues; k++) {
      const az = (k / tongues) * Math.PI * 2 + 0.4;
      const tilt = 0.55 + 0.2 * Math.sin(k * 2.1); // radians off vertical
      const d: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
      const size = r * (0.26 + 0.1 * ((k * 7) % 3));
      holder.addChild(
        flameShell(doc, `FireTongue${k}`, size, size * (3.4 + (k % 2)), k * 1.7, k % 2 ? tongueMatA : tongueMatB)
          .setTranslation([d[0] * r * 1.02, d[1] * r * 1.02, d[2] * r * 1.02])
          .setRotation(quatFromUp(d)),
      );
    }
    node.addChild(holder);
  }
}

// ---------------------------------------------------------------------------
// Based Phone (419)
// ---------------------------------------------------------------------------

const BASE_BLUE: [number, number, number, number] = [0.0, 0.2, 1.0, 1.0];
const SCREEN_BLUE: [number, number, number, number] = [0.05, 0.32, 1.0, 1.0];
const WHITE: [number, number, number, number] = [0.96, 0.97, 1.0, 1.0];
const DARK_EDGE: [number, number, number, number] = [0.0, 0.12, 0.6, 1.0];

/**
 * The Based Phone, authored from scratch (no 3D source art exists for
 * Base-era wearables). Built in hand-socket space: gripped near the origin,
 * screen up +Y facing +Z, sized against the Spirit Sword reference pose.
 */
export function buildBasePhone(doc: Document): Node {
  const holder = doc.createNode("BasePhoneBody");
  const W = 0.42, H = 0.78, D = 0.07;
  // Slab + slightly larger dark rim behind it for a toon outline read.
  holder.addChild(boxAt(doc, "PhoneRim", [0, H / 2, -0.006], [W + 0.03, H + 0.03, D], unlitMat(doc, "PhoneRimMat", DARK_EDGE)));
  holder.addChild(boxAt(doc, "PhoneBody", [0, H / 2, 0], [W, H, D], unlitMat(doc, "PhoneBodyMat", BASE_BLUE)));
  // Screen face, popped just in front.
  holder.addChild(boxAt(doc, "PhoneScreen", [0, H / 2, D / 2 + 0.004], [W * 0.86, H * 0.88, 0.008], unlitMat(doc, "PhoneScreenMat", SCREEN_BLUE)));
  // Base logo: white disc with the flat chord bar on the left.
  const logoZ = D / 2 + 0.012;
  holder.addChild(discAt(doc, "BaseLogoDisc", [0, H / 2, logoZ], W * 0.28, unlitMat(doc, "BaseLogoMat", WHITE)));
  holder.addChild(boxAt(doc, "BaseLogoBar", [-W * 0.19, H / 2, logoZ + 0.002], [W * 0.16, W * 0.09, 0.004], unlitMat(doc, "BaseLogoBarMat", SCREEN_BLUE)));
  // Speaker slit + home dot for a finished read.
  holder.addChild(boxAt(doc, "PhoneSpeaker", [0, H * 0.92, logoZ], [W * 0.3, 0.018, 0.004], unlitMat(doc, "PhoneSpeakerMat", WHITE)));
  holder.addChild(discAt(doc, "PhoneHomeDot", [0, H * 0.09, logoZ], W * 0.05, unlitMat(doc, "PhoneHomeMat", WHITE)));
  return holder;
}
