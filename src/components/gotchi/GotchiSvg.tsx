import { useEffect, useMemo, useRef, useState } from "react";
type PreviewInput = {
  tokenId: number;
  hauntId: number;
  collateral: string;
  numericTraits: number[];
  wearableIds: number[];
};
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http";

interface GotchiSvgProps {
  gotchiId?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
  className?: string;
  mode?: "naked" | "preview";
  testId?: string;
}

export function GotchiSvg({
  gotchiId,
  hauntId,
  collateral,
  numericTraits,
  equippedWearables = [],
  className,
  mode = "preview",
  testId,
}: GotchiSvgProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fallbackSvg = (key: string) => {
    const hue = key
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="hsl(${hue} 50% 96%)"/><circle cx="32" cy="28" r="16" fill="hsl(${hue} 40% 85%)"/><circle cx="26" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/><circle cx="38" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/><path d="M22 36c4-4 16-4 20 0" stroke="hsl(${hue} 40% 30%)" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
  };

  const wearablesKey = useMemo(() => {
    if (mode === "naked") return "";
    return equippedWearables.join("-");
  }, [equippedWearables, mode]);

  const requestKey = useMemo(
    () =>
      [
        gotchiId || "",
        hauntId ?? "",
        collateral || "",
        (numericTraits || []).join(","),
        wearablesKey,
        mode,
      ].join("|"),
    [gotchiId, hauntId, collateral, numericTraits, wearablesKey, mode]
  );

  useEffect(() => {
    if (!gotchiId) return;
    const requestId = ++requestIdRef.current;
    let mounted = true;
    setLoading(true);
    const tokenId = Number(
      gotchiId.includes("-") ? gotchiId.split("-").slice(-1)[0] : gotchiId
    );
    if (!Number.isFinite(tokenId)) {
      setLoading(false);
      return;
    }
    const usePreview =
      mode === "preview" &&
      Number.isFinite(tokenId) &&
      typeof hauntId === "number" &&
      !!collateral &&
      Array.isArray(numericTraits);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchSvg = async () => {
      const url = usePreview
        ? "/api/gotchis/preview"
        : `/api/gotchis/${tokenId}/svg`;
      const body: PreviewInput | undefined = usePreview
        ? {
            tokenId,
            hauntId: hauntId as number,
            collateral: collateral as string,
            numericTraits: numericTraits as number[],
            wearableIds: equippedWearables,
          }
        : undefined;
      const res = await fetchWithTimeout(url, {
        method: usePreview ? "POST" : "GET",
        headers: usePreview ? { "content-type": "application/json" } : undefined,
        body: usePreview ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        timeoutMs: 8000,
      });
      if (!res) {
        return null;
      }
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.svg as string;
    };

    fetchSvg()
      .then((data) => {
        if (!data) return;
        if (mounted && requestId === requestIdRef.current) {
          setSvg(data || fallbackSvg(requestKey));
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted && requestId === requestIdRef.current) {
          setSvg(fallbackSvg(requestKey));
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [requestKey, gotchiId, hauntId, collateral, numericTraits, equippedWearables]);

  return (
    <div
      data-testid={testId || "gotchi-svg"}
      data-request-key={requestKey}
      className={cn(
        "relative rounded-md bg-muted overflow-hidden flex items-center justify-center",
        className
      )}
    >
      {loading && !svg && (
        <div className="w-full h-full animate-pulse bg-muted" />
      )}
      {svg && (
        <div
          data-testid={testId ? `${testId}-content` : "gotchi-svg-content"}
          className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}

