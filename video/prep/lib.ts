// I/O helpers for prep scripts. Run from repo root via: pnpm exec tsx video/prep/<x>.ts
import fs from "node:fs";
import path from "node:path";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "../../src/lib/subgraph";

const VIDEO_DIR = path.resolve(import.meta.dirname, "..");
const PROPS_DIR = path.join(VIDEO_DIR, "props");
const CACHE_DIR = path.join(VIDEO_DIR, "assets-cache");

export function writeProps(name: string, data: unknown): string {
  fs.mkdirSync(PROPS_DIR, { recursive: true });
  const file = path.join(PROPS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`props -> ${file}`);
  return file;
}

export async function cachedSvg(key: string, fetcher: () => Promise<string>): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}.svg`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const svg = await fetcher();
  if (!svg || !svg.includes("<svg")) {
    throw new Error(`fetcher for ${key} did not return an SVG`);
  }
  fs.writeFileSync(file, svg);
  return svg;
}

export async function coreQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) {
    throw new Error(`subgraph error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export type GotchiRow = {
  id: string;
  gotchiId: string;
  name: string;
  numericTraits: number[];
  modifiedNumericTraits: number[];
  withSetsNumericTraits: number[] | null;
  equippedWearables: number[];
  baseRarityScore: string;
  kinship: string;
  level: string;
  hauntId: string;
  collateral: string;
  createdAt: string;
};

export async function fetchGotchi(
  tokenId: string,
): Promise<{ gotchi: GotchiRow; currentBlock: number }> {
  const data = await coreQuery<{ aavegotchis: GotchiRow[]; _meta: { block: { number: number } } }>(
    `query ($id: BigInt!) {
      aavegotchis(where: { gotchiId: $id, status: 3 }) {
        id gotchiId name numericTraits modifiedNumericTraits withSetsNumericTraits
        equippedWearables baseRarityScore kinship level hauntId collateral createdAt
      }
      _meta { block { number } }
    }`,
    { id: tokenId },
  );
  const gotchi = data.aavegotchis[0];
  if (!gotchi) throw new Error(`gotchi ${tokenId} not found (status 3)`);
  return { gotchi, currentBlock: data._meta.block.number };
}

export function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
