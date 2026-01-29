import { useState, useEffect, useCallback } from "react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { env } from "@/lib/env";

type FrequencyMaps = {
  shapeCount: Map<string, number>;
  colorCount: Map<string, number>;
  comboCount: Map<string, number>;
  total: number;
};

type HauntFrequencyCache = Map<number, FrequencyMaps>;

const GOTCHIS_FOR_FREQUENCY = `
  query GotchisForFrequency($first: Int!, $skip: Int!, $hauntId: String!) {
    aavegotchis(
      first: $first
      skip: $skip
      where: { status: 3, hauntId: $hauntId }
      orderBy: gotchiId
      orderDirection: asc
    ) {
      gotchiId
      hauntId
      numericTraits
    }
  }
`;

const frequencyCache: HauntFrequencyCache = new Map();
const loadingHaunts = new Set<number>();

async function fetchAllGotchisForHaunt(hauntId: number): Promise<{ gotchiId: string; numericTraits: number[] }[]> {
  const allGotchis: { gotchiId: string; numericTraits: number[] }[] = [];
  let skip = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(env.gotchiSubgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: GOTCHIS_FOR_FREQUENCY,
          variables: { first: batchSize, skip, hauntId: String(hauntId) },
        }),
      });

      if (!response.ok) {
        console.error(`Frequency fetch failed: ${response.status}`);
        break;
      }

      const data = await response.json();
      if (data.errors) {
        console.error("GraphQL error:", data.errors);
        break;
      }

      const gotchis = data.data?.aavegotchis || [];
      allGotchis.push(...gotchis);

      if (gotchis.length < batchSize) {
        hasMore = false;
      } else {
        skip += batchSize;
      }
    } catch (err) {
      console.error("Error fetching gotchis for frequency:", err);
      break;
    }
  }

  return allGotchis;
}

function buildFrequencyMaps(gotchis: { gotchiId: string; numericTraits: number[] }[]): FrequencyMaps {
  const shapeCount = new Map<string, number>();
  const colorCount = new Map<string, number>();
  const comboCount = new Map<string, number>();

  for (const g of gotchis) {
    const traits = g.numericTraits;
    if (traits && traits.length >= 6) {
      const eyeShape = traits[4];
      const eyeColor = traits[5];
      const shapeKey = String(eyeShape);
      const colorKey = String(eyeColor);
      const comboKey = `${eyeShape}|${eyeColor}`;

      shapeCount.set(shapeKey, (shapeCount.get(shapeKey) || 0) + 1);
      colorCount.set(colorKey, (colorCount.get(colorKey) || 0) + 1);
      comboCount.set(comboKey, (comboCount.get(comboKey) || 0) + 1);
    }
  }

  return { shapeCount, colorCount, comboCount, total: gotchis.length };
}

async function loadHauntFrequency(hauntId: number): Promise<FrequencyMaps | null> {
  if (frequencyCache.has(hauntId)) {
    return frequencyCache.get(hauntId)!;
  }

  if (loadingHaunts.has(hauntId)) {
    return null;
  }

  loadingHaunts.add(hauntId);

  try {
    const gotchis = await fetchAllGotchisForHaunt(hauntId);
    const maps = buildFrequencyMaps(gotchis);
    frequencyCache.set(hauntId, maps);
    return maps;
  } catch (err) {
    console.error("Failed to build frequency maps:", err);
    return null;
  } finally {
    loadingHaunts.delete(hauntId);
  }
}

export function useTraitFrequency(gotchis: ExplorerGotchi[]) {
  const [frequencyMaps, setFrequencyMaps] = useState<Map<number, FrequencyMaps>>(new Map());
  const [loading, setLoading] = useState(false);

  const hauntsNeeded = Array.from(new Set(gotchis.map((g) => g.hauntId)));

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const missingHaunts = hauntsNeeded.filter((h) => !frequencyCache.has(h));
      if (missingHaunts.length === 0) {
        const cached = new Map<number, FrequencyMaps>();
        for (const h of hauntsNeeded) {
          if (frequencyCache.has(h)) {
            cached.set(h, frequencyCache.get(h)!);
          }
        }
        setFrequencyMaps(cached);
        return;
      }

      setLoading(true);

      for (const hauntId of missingHaunts) {
        if (cancelled) break;
        await loadHauntFrequency(hauntId);
      }

      if (!cancelled) {
        const newMaps = new Map<number, FrequencyMaps>();
        for (const h of hauntsNeeded) {
          if (frequencyCache.has(h)) {
            newMaps.set(h, frequencyCache.get(h)!);
          }
        }
        setFrequencyMaps(newMaps);
        setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [hauntsNeeded.join(",")]);

  const getEyeShapeRarity = useCallback(
    (gotchi: ExplorerGotchi): number | null => {
      const maps = frequencyMaps.get(gotchi.hauntId);
      if (!maps) return null;
      const traits = gotchi.numericTraits;
      if (!traits || traits.length < 6) return null;
      const shapeKey = String(traits[4]);
      return maps.shapeCount.get(shapeKey) || null;
    },
    [frequencyMaps]
  );

  const getEyeColorRarity = useCallback(
    (gotchi: ExplorerGotchi): number | null => {
      const maps = frequencyMaps.get(gotchi.hauntId);
      if (!maps) return null;
      const traits = gotchi.numericTraits;
      if (!traits || traits.length < 6) return null;
      const colorKey = String(traits[5]);
      return maps.colorCount.get(colorKey) || null;
    },
    [frequencyMaps]
  );

  const getEyeComboRarity = useCallback(
    (gotchi: ExplorerGotchi): number | null => {
      const maps = frequencyMaps.get(gotchi.hauntId);
      if (!maps) return null;
      const traits = gotchi.numericTraits;
      if (!traits || traits.length < 6) return null;
      const comboKey = `${traits[4]}|${traits[5]}`;
      return maps.comboCount.get(comboKey) || null;
    },
    [frequencyMaps]
  );

  const getRarities = useCallback(
    (gotchi: ExplorerGotchi): { shape: number | null; color: number | null; combo: number | null } => {
      const maps = frequencyMaps.get(gotchi.hauntId);
      if (!maps) return { shape: null, color: null, combo: null };
      const traits = gotchi.numericTraits;
      if (!traits || traits.length < 6) return { shape: null, color: null, combo: null };

      const eyeShape = traits[4];
      const eyeColor = traits[5];

      return {
        shape: maps.shapeCount.get(String(eyeShape)) || null,
        color: maps.colorCount.get(String(eyeColor)) || null,
        combo: maps.comboCount.get(`${eyeShape}|${eyeColor}`) || null,
      };
    },
    [frequencyMaps]
  );

  return {
    loading,
    frequencyMaps,
    getEyeShapeRarity,
    getEyeColorRarity,
    getEyeComboRarity,
    getRarities,
  };
}

export function getEyeShapeName(value: number): string {
  if (value <= 1) return "Mythical Low";
  if (value >= 98) return "Mythical High";
  if (value <= 9) return "Rare Low";
  if (value >= 91) return "Rare High";
  if (value <= 24) return "Uncommon Low";
  if (value >= 75) return "Uncommon High";
  return "Common";
}

export function getEyeColorName(value: number): string {
  if (value <= 1) return "Mythical Low";
  if (value >= 98) return "Mythical High";
  if (value <= 9) return "Rare Low";
  if (value >= 91) return "Rare High";
  if (value <= 24) return "Uncommon Low";
  if (value >= 75) return "Uncommon High";
  return "Common";
}
