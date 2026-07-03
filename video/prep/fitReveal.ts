// Usage: pnpm exec tsx video/prep/fitReveal.ts --gotchi 4285
import { previewGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import type { FitRevealProps, FitStep } from "../src/types";
import { arg, cachedSvg, fetchGotchi, writeProps } from "./lib";
import { cumulativeSlotArrays, equipOrder } from "./shape";

const SLOT_LABELS: Record<number, string> = {
  0: "BODY",
  1: "FACE",
  2: "EYES",
  3: "HEAD",
  4: "L HAND",
  5: "R HAND",
  6: "PET",
  7: "BG",
};

async function main() {
  const tokenId = arg("--gotchi");
  if (!tokenId) throw new Error("usage: --gotchi <tokenId>");

  const { gotchi } = await fetchGotchi(tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));

  const order = equipOrder(gotchi.equippedWearables);
  if (order.length === 0) throw new Error(`gotchi ${tokenId} has no wearables equipped`);
  const slotArrays = cumulativeSlotArrays(order);

  const previewBase = {
    tokenId,
    hauntId: Number(gotchi.hauntId),
    collateral: gotchi.collateral,
    numericTraits: gotchi.numericTraits,
  };
  const nakedSvg = await cachedSvg(`naked-${tokenId}`, () =>
    previewGotchiSvg({ ...previewBase, wearableIds: new Array(16).fill(0) }),
  );
  const nakedBrs = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: [],
    wearablesById,
  }).totalBrs;

  const steps: FitStep[] = [];
  for (let i = 0; i < order.length; i++) {
    const idsSoFar = order.slice(0, i + 1).map((o) => o.id);
    const svg = await cachedSvg(`fit-${tokenId}-step${i}`, () =>
      previewGotchiSvg({ ...previewBase, wearableIds: slotArrays[i] }),
    );
    const brs = computeBRSBreakdown({
      baseTraits: gotchi.numericTraits,
      equippedWearables: idsSoFar,
      wearablesById,
    }).totalBrs;
    steps.push({
      svg,
      wearableId: order[i].id,
      wearableName: wearablesById.get(order[i].id)?.name ?? `#${order[i].id}`,
      slotLabel: SLOT_LABELS[order[i].slot] ?? `SLOT ${order[i].slot}`,
      brs,
    });
  }

  const finalBreakdown = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: order.map((o) => o.id),
    wearablesById,
  });

  const props: FitRevealProps = {
    videoId: `fitreveal-${tokenId}`,
    gotchiId: tokenId,
    name: gotchi.name || `Gotchi #${tokenId}`,
    nakedSvg,
    nakedBrs,
    steps,
    finalBrs: finalBreakdown.totalBrs,
    setName: finalBreakdown.bestSet?.name ?? null,
    setBonusBrs: finalBreakdown.setFlatBrs ?? 0,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
