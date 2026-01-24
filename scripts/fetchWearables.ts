import fs from "fs";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const PAGE_SIZE = 1000;

const RARITY_TIERS = [
  "Common",
  "Uncommon",
  "Rare",
  "Legendary",
  "Mythical",
  "Godlike",
];

function getRarityTier(rarityScore: number): string {
  if (rarityScore >= 530) return "Godlike";
  if (rarityScore >= 450) return "Mythical";
  if (rarityScore >= 350) return "Legendary";
  if (rarityScore >= 300) return "Rare";
  if (rarityScore >= 250) return "Uncommon";
  return "Common";
}

async function fetchPage(query: string, variables: Record<string, number>) {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json.data;
}

async function fetchWearables() {
  let skip = 0;
  let hasMore = true;
  const all: any[] = [];

  while (hasMore) {
    const query = `
      query($first:Int!,$skip:Int!){
        itemTypes(
          first:$first
          skip:$skip
          where:{category:0}
          orderBy:name
          orderDirection:asc
        ){
          id
          name
          traitModifiers
          slotPositions
          rarityScoreModifier
          category
        }
      }
    `;

    const data = await fetchPage(query, { first: PAGE_SIZE, skip });
    const items = data?.itemTypes || [];
    if (items.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of items) {
      const id = Number(item.id) || 0;
      if (!id) continue;
      const slotPositions = Array.isArray(item.slotPositions)
        ? item.slotPositions.map((s: any) => Boolean(s))
        : new Array(8).fill(false);
      const slots = slotPositions
        .map((allowed: boolean, index: number) => (allowed ? index : null))
        .filter((value: number | null) => value !== null);
      const handPlacement =
        slotPositions[4] && slotPositions[5]
          ? "either"
          : slotPositions[4]
          ? "left"
          : slotPositions[5]
          ? "right"
          : "none";
      const rarityScoreModifier = Number(item.rarityScoreModifier) || 0;

      all.push({
        id,
        name: item.name || "Unknown",
        traitModifiers: Array.isArray(item.traitModifiers)
          ? item.traitModifiers.map((t: any) => Number(t) || 0)
          : [0, 0, 0, 0, 0, 0],
        slotPositions,
        slots,
        handPlacement,
        rarityScoreModifier,
        rarity: getRarityTier(rarityScoreModifier),
        category: Number(item.category) || 0,
        setIds: [] as string[],
      });
    }

    skip += PAGE_SIZE;
    if (items.length < PAGE_SIZE) {
      hasMore = false;
    }
  }

  return all;
}

async function fetchWearableSets() {
  let skip = 0;
  let hasMore = true;
  const all: any[] = [];

  while (hasMore) {
    const query = `
      query($first:Int!,$skip:Int!){
        wearableSets(
          first:$first
          skip:$skip
          orderBy:name
          orderDirection:asc
        ){
          id
          name
          wearableIds
          traitBonuses
        }
      }
    `;

    const data = await fetchPage(query, { first: PAGE_SIZE, skip });
    const items = data?.wearableSets || [];
    if (items.length === 0) {
      hasMore = false;
      break;
    }

    for (const set of items) {
      all.push({
        id: String(set.id),
        name: set.name || "Unknown Set",
        wearableIds: Array.isArray(set.wearableIds)
          ? set.wearableIds.map((id: any) => Number(id) || 0)
          : [],
        traitBonuses: Array.isArray(set.traitBonuses)
          ? set.traitBonuses.map((t: any) => Number(t) || 0)
          : [0, 0, 0, 0, 0, 0],
      });
    }

    skip += PAGE_SIZE;
    if (items.length < PAGE_SIZE) {
      hasMore = false;
    }
  }

  return all;
}

async function run() {
  const wearables = await fetchWearables();
  const sets = await fetchWearableSets();

  const wearableById = new Map(wearables.map((w) => [w.id, w]));
  for (const set of sets) {
    for (const id of set.wearableIds) {
      const wearable = wearableById.get(id);
      if (wearable) {
        wearable.setIds.push(set.id);
      }
    }
  }

  const dataDir = "data";
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    `${dataDir}/wearables.json`,
    JSON.stringify(wearables, null, 2)
  );
  fs.writeFileSync(
    `${dataDir}/wearableSets.json`,
    JSON.stringify(sets, null, 2)
  );
  console.log(`wrote ${wearables.length} wearables and ${sets.length} sets`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

