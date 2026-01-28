import { useState, useEffect } from "react";
import type { Gotchi } from "@/types";

function getGotchiSvgUrl(gotchi: Gotchi): string {
  const id = gotchi.gotchiId || gotchi.id;
  return `https://app.aavegotchi.com/images/aavegotchis/${id}.svg`;
}

export function usePreloadAssets(gotchis: Gotchi[]) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (gotchis.length === 0) {
      setLoading(false);
      return;
    }

    let loadedCount = 0;
    const failed = new Set<string>();
    const total = gotchis.length;

    const loadImage = (gotchi: Gotchi): Promise<void> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          setProgress(Math.round((loadedCount / total) * 100));
          resolve();
        };
        img.onerror = () => {
          loadedCount++;
          failed.add(gotchi.id);
          setProgress(Math.round((loadedCount / total) * 100));
          resolve();
        };
        img.src = getGotchiSvgUrl(gotchi);
      });
    };

    Promise.all(gotchis.map(loadImage)).then(() => {
      setFailedIds(failed);
      setLoading(false);
    });
  }, [gotchis]);

  return { loading, progress, failedIds };
}
