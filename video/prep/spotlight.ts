// Usage (from repo root): pnpm exec tsx video/prep/spotlight.ts --gotchi 4285
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import { flavorFor } from "../src/flavor";
import type { SpotlightProps, TraitTuple } from "../src/types";
import { arg, cachedSvg, fetchGotchi, writeProps } from "./lib";
import { blocksToDays } from "./shape";

async function main() {
  const tokenId = arg("--gotchi");
  if (!tokenId) throw new Error("usage: --gotchi <tokenId>");

  const { gotchi, currentBlock } = await fetchGotchi(tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));

  const svg = await cachedSvg(`gotchi-${tokenId}`, () => getGotchiSvg(tokenId));
  const equippedIds = gotchi.equippedWearables.filter((id) => id > 0);
  const breakdown = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    modifiedNumericTraits: gotchi.modifiedNumericTraits,
    withSetsNumericTraits: gotchi.withSetsNumericTraits ?? undefined,
    equippedWearables: equippedIds,
    wearablesById,
  });

  const props: SpotlightProps = {
    videoId: `spotlight-${tokenId}`,
    gotchiId: tokenId,
    name: gotchi.name || `Gotchi #${tokenId}`,
    svg,
    traits: gotchi.modifiedNumericTraits.slice(0, 6) as TraitTuple,
    brs: breakdown.totalBrs,
    kinship: Number(gotchi.kinship),
    level: Number(gotchi.level),
    ageDays: blocksToDays(currentBlock - Number(gotchi.createdAt)),
    setName: breakdown.bestSet?.name ?? null,
    ownerShort: `#${tokenId}`,
    flavor: flavorFor(gotchi.numericTraits.slice(0, 6) as TraitTuple),
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
