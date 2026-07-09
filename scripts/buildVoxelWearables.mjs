/**
 * Build pixel-faithful voxel GLBs for the wearables that never received
 * official 3D models (162 Miami Shirt, 418 Based Shirt, 419 Base App,
 * 420 Jesse Pollak Hair — all post-date the render pipeline's shutdown).
 *
 * Technique: extrude the official pixel art (scripts/voxel-grids.json, sampled from
 * dapp.aavegotchi.com/brand/items/{id}.svg at 1 SVG unit = 1 art pixel) into
 * a centered slab, greedy-meshed per color, with sRGB-correct vertex colors
 * and a matte PBR material. Output: public/models3d/{id}.glb, consumed by
 * src/lib/gotchi3d.ts (LOCAL_WEARABLE_3D).
 *
 * Usage: node scripts/buildVoxelWearables.mjs [path/to/scripts/voxel-grids.json]
 */
import { Document, NodeIO } from "@gltf-transform/core";
import fs from "node:fs";
import path from "node:path";

const GRIDS_PATH = process.argv[2] ?? "scripts/voxel-grids.json";
const OUT_DIR = path.join(process.cwd(), "public", "models3d");

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const hexToLinearRgb = (hex) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16)));

/** Greedy rectangle decomposition of a color grid (same-color rects). */
function greedyRects(rows, vw, vh) {
  const used = Array.from({ length: vh }, () => new Array(vw).fill(false));
  const rects = [];
  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < vw; x++) {
      const color = rows[y][x];
      if (!color || used[y][x]) continue;
      let w = 1;
      while (x + w < vw && rows[y][x + w] === color && !used[y][x + w]) w++;
      let h = 1;
      outer: while (y + h < vh) {
        for (let i = 0; i < w; i++) if (rows[y + h][x + i] !== color || used[y + h][x + i]) break outer;
        h++;
      }
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) used[y + dy][x + dx] = true;
      rects.push({ x, y, w, h, color });
    }
  }
  return rects;
}

function buildMesh(rows, vw, vh) {
  const positions = [];
  const colors = [];
  const indices = [];
  const scale = 2 / Math.max(vw, vh); // longest side = 2 world units
  const depthPx = Math.max(2, Math.round(Math.min(vw, vh) * 0.15));
  const zf = (depthPx * scale) / 2; // front z
  const zb = -zf; // back z
  // Art rows run top-to-bottom; world y runs bottom-to-top. Center on origin.
  const X = (x) => (x - vw / 2) * scale;
  const Y = (y) => (vh / 2 - y) * scale; // y = art row boundary (0..vh)

  const quad = (verts, color) => {
    const base = positions.length / 3;
    const rgb = hexToLinearRgb(color);
    for (const [px, py, pz] of verts) {
      positions.push(px, py, pz);
      colors.push(...rgb);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const filled = (x, y) => x >= 0 && x < vw && y >= 0 && y < vh && !!rows[y][x];

  // Front (+z) and back (-z) faces from greedy rects (CCW seen from outside).
  for (const r of greedyRects(rows, vw, vh)) {
    const x0 = X(r.x), x1 = X(r.x + r.w), yT = Y(r.y), yB = Y(r.y + r.h);
    quad([[x0, yB, zf], [x1, yB, zf], [x1, yT, zf], [x0, yT, zf]], r.color);
    quad([[x1, yB, zb], [x0, yB, zb], [x0, yT, zb], [x1, yT, zb]], r.color);
  }

  // Side walls at vertical boundaries (left/right faces), merged along y runs.
  for (let x = 0; x <= vw; x++) {
    for (let y = 0; y < vh; y++) {
      const right = filled(x, y), left = filled(x - 1, y);
      if (right === left) continue;
      const color = right ? rows[y][x] : rows[y][x - 1];
      let h = 1;
      while (
        y + h < vh &&
        filled(x, y + h) !== filled(x - 1, y + h) &&
        (filled(x, y + h) ? rows[y + h][x] : rows[y + h][x - 1]) === color &&
        filled(x, y + h) === right
      ) h++;
      const wx = X(x), yT = Y(y), yB = Y(y + h);
      if (right) quad([[wx, yB, zb], [wx, yB, zf], [wx, yT, zf], [wx, yT, zb]], color); // faces -x
      else quad([[wx, yB, zf], [wx, yB, zb], [wx, yT, zb], [wx, yT, zf]], color); // faces +x
      y += h - 1;
    }
  }

  // Top/bottom walls at horizontal boundaries, merged along x runs.
  for (let y = 0; y <= vh; y++) {
    for (let x = 0; x < vw; x++) {
      const below = filled(x, y), above = filled(x, y - 1);
      if (below === above) continue;
      const color = below ? rows[y][x] : rows[y - 1][x];
      let w = 1;
      while (
        x + w < vw &&
        filled(x + w, y) !== filled(x + w, y - 1) &&
        (filled(x + w, y) ? rows[y][x + w] : rows[y - 1][x + w]) === color &&
        filled(x + w, y) === below
      ) w++;
      const wy = Y(y), x0 = X(x), x1 = X(x + w);
      if (below) quad([[x0, wy, zf], [x1, wy, zf], [x1, wy, zb], [x0, wy, zb]], color); // faces +y (top of shape)
      else quad([[x0, wy, zb], [x1, wy, zb], [x1, wy, zf], [x0, wy, zf]], color); // faces -y
      x += w - 1;
    }
  }

  return { positions, colors, indices };
}

async function main() {
  let grids = JSON.parse(fs.readFileSync(GRIDS_PATH, "utf8"));
  if (typeof grids === "string") grids = JSON.parse(grids); // browser export is double-encoded
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO();

  for (const [id, grid] of Object.entries(grids)) {
    if (typeof grid === "string") { console.error(`skip ${id}: ${grid}`); continue; }
    const { positions, colors, indices } = buildMesh(grid.rows, grid.vw, grid.vh);

    const doc = new Document();
    const buffer = doc.createBuffer();
    const material = doc
      .createMaterial(`wearable_${id}`)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.9);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
      .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(colors)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer))
      .setMaterial(material);
    const mesh = doc.createMesh(`wearable_${id}`).addPrimitive(prim);
    const node = doc.createNode(`wearable_${id}`).setMesh(mesh);
    doc.createScene("scene").addChild(node);

    const out = path.join(OUT_DIR, `${id}.glb`);
    await io.write(out, doc);
    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`wrote ${out} (${kb} KB, ${indices.length / 3} tris)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
