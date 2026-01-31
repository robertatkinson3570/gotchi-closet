import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http";

type PreviewInput = {
  tokenId: number;
  hauntId: number;
  collateral: string;
  numericTraits: number[];
  wearableIds: number[];
};

interface GotchiSvgProps {
  gotchiId?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
  className?: string;
  mode?: "naked" | "preview";
  testId?: string;
  useBlobUrl?: boolean; // If true, use <img> with blob URL instead of dangerouslySetInnerHTML
}

// CLIENT-SIDE CACHE: requestKey -> svg string
const clientSvgCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | null>>();

// BLOB URL CACHE: requestKey -> blob URL (for <img> rendering)
const blobUrlCache = new Map<string, string>();
// Track which blob URLs are in use to prevent premature revocation
const blobUrlRefCount = new Map<string, number>();

// Compute hash of SVG string for commit guard
function hashSvg(svg: string): string {
  // Simple hash function - in production you might want crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < svg.length; i++) {
    const char = svg.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Compute requestKey from params (same logic as component)
function computeRequestKey(params: {
  gotchiId?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
  mode?: "naked" | "preview";
}): string {
  const wearablesKey = params.mode === "naked" 
    ? "" 
    : (params.equippedWearables || []).join("-");
  
  return [
    params.gotchiId || "",
    params.hauntId ?? "",
    params.collateral || "",
    (params.numericTraits || []).join(","),
    wearablesKey,
    params.mode || "preview",
  ].join("|");
}

// Get cached SVG synchronously (for instant render)
export function getCachedSvg(requestKey: string): string | null {
  const cached = clientSvgCache.get(requestKey) || null;
  if (process.env.NODE_ENV === "development" && cached) {
    // Extract a color signature from the SVG to verify it's unique
    const colorMatch = cached.match(/fill="([^"]+)"/) || cached.match(/stroke="([^"]+)"/);
    const color = colorMatch ? colorMatch[1] : "unknown";
    console.log(`[Cache] Retrieved SVG for key ${requestKey.substring(0, 50)}... color: ${color.substring(0, 20)}`);
  }
  return cached;
}

// Prefetch function (used by ExplorerGrid)
export async function prefetchGotchiSvg(params: {
  gotchiId?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
  mode?: "naked" | "preview";
}): Promise<void> {
  const requestKey = computeRequestKey(params);
  
  // Already cached
  if (clientSvgCache.has(requestKey)) {
    return;
  }
  
  // Already in-flight
  if (inFlightRequests.has(requestKey)) {
    await inFlightRequests.get(requestKey);
    return;
  }
  
  const gotchiIdStr = String(params.gotchiId || "");
  const tokenId = Number(
    gotchiIdStr.includes("-") ? gotchiIdStr.split("-").slice(-1)[0] : gotchiIdStr
  );
  
  if (!Number.isFinite(tokenId)) return;
  
  const usePreview =
    params.mode === "preview" &&
    Number.isFinite(tokenId) &&
    typeof params.hauntId === "number" &&
    !!params.collateral &&
    Array.isArray(params.numericTraits);
  
  const fetchPromise = (async () => {
    try {
      const url = usePreview
        ? "/api/gotchis/preview"
        : `/api/gotchis/${tokenId}/svg`;
      
      const body: PreviewInput | undefined = usePreview
        ? {
            tokenId,
            hauntId: params.hauntId as number,
            collateral: params.collateral as string,
            numericTraits: params.numericTraits as number[],
            wearableIds: params.equippedWearables || [],
          }
        : undefined;
      
      const res = await fetchWithTimeout(url, {
        method: usePreview ? "POST" : "GET",
        headers: usePreview ? { "content-type": "application/json" } : undefined,
        body: usePreview ? JSON.stringify(body) : undefined,
        timeoutMs: 8000,
      });
      
      if (!res || !res.ok) {
        return null;
      }
      
      const json = await res.json();
      const svgString = json.svg as string;
      
      if (svgString && svgString.length > 100) {
        clientSvgCache.set(requestKey, svgString);
        return svgString;
      }
      
      return null;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(requestKey);
    }
  })();
  
  inFlightRequests.set(requestKey, fetchPromise);
  await fetchPromise;
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
  useBlobUrl = false, // Default to false for backward compatibility
}: GotchiSvgProps) {
  // CRITICAL: Always start with null - no initial SVG
  const [svg, setSvg] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null); // Blob URL for <img> rendering
  const [, setLoading] = useState(false); // Loading state (not used in render, but set for future use)
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const previousRequestKeyRef = useRef<string | null>(null);
  const lockedSvgRef = useRef<string | null>(null); // Lock SVG once it's set for a requestKey
  const lastCommittedHashRef = useRef<string | null>(null); // Track last committed SVG hash
  const commitCountRef = useRef(0); // Track commit count for testing
  const blobUrlRef = useRef<string | null>(null); // Track current blob URL to revoke on cleanup

  // Use stringified arrays for stable dependencies (prevents re-computation on array reference changes)
  const numericTraitsStr = useMemo(() => {
    if (!Array.isArray(numericTraits) || numericTraits.length === 0) return "";
    return numericTraits.join(",");
  }, [Array.isArray(numericTraits) ? numericTraits.join(",") : ""]); // Join once, use string as dependency

  const wearablesKey = useMemo(() => {
    if (mode === "naked") return "";
    if (!Array.isArray(equippedWearables) || equippedWearables.length === 0) return "";
    return equippedWearables.join("-");
  }, [Array.isArray(equippedWearables) ? equippedWearables.join("-") : "", mode]); // Join once, use string as dependency

  const requestKey = useMemo(
    () => {
      const key = [
        gotchiId || "",
        hauntId ?? "",
        collateral || "",
        numericTraitsStr,
        wearablesKey,
        mode,
      ].join("|");
      
      // CRITICAL: Log requestKey changes to debug multiple fetches
      if (process.env.NODE_ENV === "development" && previousRequestKeyRef.current !== null && previousRequestKeyRef.current !== key) {
        const prevParts = previousRequestKeyRef.current.split("|");
        const currParts = key.split("|");
        console.error("🚨 requestKey CHANGED for same component!", {
          gotchiId,
          previous: previousRequestKeyRef.current.substring(0, 80) + "...",
          current: key.substring(0, 80) + "...",
          changedFields: {
            gotchiId: prevParts[0] !== currParts[0],
            hauntId: prevParts[1] !== currParts[1],
            collateral: prevParts[2] !== currParts[2],
            numericTraits: prevParts[3] !== currParts[3],
            wearables: prevParts[4] !== currParts[4],
            mode: prevParts[5] !== currParts[5],
          },
          // If gotchiId changed, this is a serious bug (component reused for different gotchi)
          gotchiIdChanged: prevParts[0] !== currParts[0],
        });
      }
      
      return key;
    },
    [gotchiId, hauntId, collateral, numericTraitsStr, wearablesKey, mode]
  );

  const fetchParams = useMemo(() => {
    const gotchiIdStr = String(gotchiId || "");
    const tokenId = Number(
      gotchiIdStr.includes("-") ? gotchiIdStr.split("-").slice(-1)[0] : gotchiIdStr
    );
    const usePreview =
      mode === "preview" &&
      Number.isFinite(tokenId) &&
      typeof hauntId === "number" &&
      !!collateral &&
      Array.isArray(numericTraits) &&
      numericTraits.length > 0;
    return { gotchiIdStr, tokenId, usePreview };
  }, [gotchiId, mode, hauntId, collateral, numericTraitsStr]);

  // SINGLE useEffect: Check locked SVG, then cache, then fetch ONCE
  useEffect(() => {
    if (!gotchiId) {
      setSvg(null);
      setLoading(false);
      return;
    }
    
    // CRITICAL: If we already have a locked SVG for this exact requestKey, NEVER fetch again
    // This ensures each gotchi loads ONCE and stays stable - NO FLASH, NO COLOR CHANGES
    if (lockedSvgRef.current && previousRequestKeyRef.current === requestKey) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[GotchiSvg] ${gotchiId} SVG LOCKED - blocking all fetches`, {
          requestKey: requestKey.substring(0, 60) + "...",
        });
      }
      return;
    }
    
    // CRITICAL: If we already have a valid SVG displayed, NEVER refetch
    // This is the KEY FIX - prevents multiple fetches that cause the flash
    if (svg && svg.length > 1000 && previousRequestKeyRef.current === requestKey) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[GotchiSvg] ${gotchiId} has valid SVG - BLOCKING refetch`, {
          requestKey: requestKey.substring(0, 60) + "...",
          svgLength: svg.length,
        });
      }
      return;
    }
    
    // Check cache first (synchronously)
    const cached = getCachedSvg(requestKey);
    if (cached) {
      // CRITICAL: Verify this cached SVG is for THIS gotchi
      const cachedKeyParts = requestKey.split("|");
      const expectedGotchiId = gotchiId || "";
      const cachedGotchiId = cachedKeyParts[0] || "";
      
      if (cachedGotchiId !== expectedGotchiId) {
        // Cache collision - don't use this SVG
        if (process.env.NODE_ENV === "development") {
          console.error(`🚨 CACHE COLLISION for ${gotchiId}!`, {
            expectedGotchiId,
            cachedGotchiId,
            requestKey: requestKey.substring(0, 80) + "...",
          });
        }
        setSvg(null);
        previousRequestKeyRef.current = requestKey;
        return;
      }
      
      // Cache hit: set immediately and LOCK it - this is the ONLY time we set SVG
      const cachedHash = hashSvg(cached);
      
      // COMMIT GUARD: Don't re-commit if hash matches (StrictMode-safe)
      if (lastCommittedHashRef.current === cachedHash && lockedSvgRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[GotchiSvg] ${gotchiId} Cache hit but hash unchanged - skipping commit`, {
            requestKey: requestKey.substring(0, 60) + "...",
          });
        }
        setLoading(false);
        return;
      }
      
      if (process.env.NODE_ENV === "development") {
        const colorMatch = cached.match(/fill="([^"]+)"/) || cached.match(/stroke="([^"]+)"/);
        const color = colorMatch ? colorMatch[1] : "unknown";
        console.log(`[GotchiSvg] ${gotchiId} Cache hit - LOCKING SVG`, {
          requestKey: requestKey.substring(0, 60) + "...",
          svgColor: color.substring(0, 30),
        });
      }
      setSvg(cached);
      lockedSvgRef.current = cached; // LOCK it immediately - prevents any future fetches
      previousRequestKeyRef.current = requestKey;
      lastCommittedHashRef.current = cachedHash; // Track committed hash
      commitCountRef.current += 1; // Increment commit count
      
      // Create blob URL if using blob URL rendering
      if (useBlobUrl) {
        // Revoke old blob URL if it exists
        if (blobUrlRef.current) {
          const oldUrl = blobUrlRef.current;
          const refCount = blobUrlRefCount.get(oldUrl) || 0;
          if (refCount <= 1) {
            URL.revokeObjectURL(oldUrl);
            blobUrlCache.delete(previousRequestKeyRef.current || "");
            blobUrlRefCount.delete(oldUrl);
          } else {
            blobUrlRefCount.set(oldUrl, refCount - 1);
          }
        }
        
        // Check if blob URL already exists in cache
        let blobUrl = blobUrlCache.get(requestKey);
        if (!blobUrl) {
          // Create new blob URL
          const blob = new Blob([cached], { type: "image/svg+xml" });
          blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(requestKey, blobUrl);
          blobUrlRefCount.set(blobUrl, 1);
        } else {
          // Increment ref count for existing blob URL
          blobUrlRefCount.set(blobUrl, (blobUrlRefCount.get(blobUrl) || 0) + 1);
        }
        
        blobUrlRef.current = blobUrl;
        setBlobUrl(blobUrl);
      }
      
      setLoading(false);
      return;
    }
    
    const { tokenId, usePreview } = fetchParams;
    if (!Number.isFinite(tokenId)) {
      setSvg(null);
      setLoading(false);
      return;
    }
    
    const requestId = ++requestIdRef.current;
    let mounted = true;
    
    // Only clear SVG if requestKey actually changed AND it's a different gotchi or collateral
    const prevParts = previousRequestKeyRef.current?.split("|") || [];
    const currParts = requestKey.split("|");
    const isDifferentGotchi = prevParts[0] !== currParts[0] || prevParts[2] !== currParts[2]; // gotchiId or collateral changed
    
    if (previousRequestKeyRef.current !== requestKey) {
      // Only clear if it's actually a different gotchi/collateral, not just traits/wearables
      if (isDifferentGotchi) {
        setSvg(null);
        lockedSvgRef.current = null; // Unlock when gotchi/collateral changes
      }
      // If same gotchi/collateral, keep the SVG to prevent flash
    }
    setLoading(true);
    
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
          // CRITICAL: Verify requestKey matches before caching
          // Re-compute requestKey to ensure it matches what we're caching
          const verifyKey = [
            gotchiId || "",
            hauntId ?? "",
            collateral || "",
            numericTraitsStr,
            wearablesKey,
            mode,
          ].join("|");
          
          if (verifyKey !== requestKey) {
            console.error("🚨 requestKey mismatch during cache!", {
              gotchiId,
              expected: requestKey,
              actual: verifyKey,
            });
            // Don't cache with wrong key
            return;
          }
          
          // CRITICAL: If we already have a locked SVG for this requestKey, NEVER replace it
          if (lockedSvgRef.current && previousRequestKeyRef.current === requestKey) {
            // SVG is locked - don't replace it
            if (process.env.NODE_ENV === "development") {
              console.log("[GotchiSvg] SVG locked - skipping update", {
                gotchiId,
                requestKey: requestKey.substring(0, 50) + "...",
              });
            }
            setLoading(false);
            return;
          }
          
          // CRITICAL: Only update if we don't already have an SVG for this exact requestKey
          // This prevents replacing a valid SVG with a different one
          if (svg && previousRequestKeyRef.current === requestKey) {
            // We already have the correct SVG, don't replace it
            if (process.env.NODE_ENV === "development") {
              console.log("[GotchiSvg] Skipping SVG update - already have correct SVG", {
                gotchiId,
                requestKey: requestKey.substring(0, 50) + "...",
              });
            }
            setLoading(false);
            return;
          }
          
          // CRITICAL: Detect placeholder SVGs and don't replace valid SVGs with them
          // Placeholder SVGs are typically very short (< 500 chars) or contain specific patterns
          const isPlaceholder = data.length < 500 || 
            data.includes('placeholder') || 
            data.includes('hsl(') && data.length < 1000; // Placeholder uses HSL colors
          
          // If we already have a valid SVG and this is a placeholder, don't replace it
          if (svg && lockedSvgRef.current && isPlaceholder && svg.length > 1000) {
            if (process.env.NODE_ENV === "development") {
              console.warn(`[GotchiSvg] Rejecting placeholder SVG for ${gotchiId} - keeping existing valid SVG`, {
                existingLength: svg.length,
                placeholderLength: data.length,
                requestKey: requestKey.substring(0, 60) + "...",
              });
            }
            setLoading(false);
            return; // Don't replace valid SVG with placeholder
          }
          
          // CRITICAL: Verify requestKey matches before caching to prevent cache collisions
          const verifyKeyParts = requestKey.split("|");
          const verifyGotchiId = verifyKeyParts[0] || "";
          if (verifyGotchiId !== (gotchiId || "")) {
            console.error("🚨 requestKey gotchiId mismatch - NOT caching!", {
              gotchiId,
              verifyGotchiId,
              requestKey: requestKey.substring(0, 80) + "...",
            });
            setLoading(false);
            return; // Don't cache with wrong gotchiId
          }
          
          // CRITICAL: If we already have a locked SVG for this exact requestKey, NEVER replace it
          // This prevents all gotchis from converging to the same SVG when the API returns identical SVGs
          if (lockedSvgRef.current && previousRequestKeyRef.current === requestKey && svg === lockedSvgRef.current) {
            // We already have the correct SVG locked - don't replace it
            if (process.env.NODE_ENV === "development") {
              console.log(`[GotchiSvg] SVG already locked for ${gotchiId} - skipping update`, {
                requestKey: requestKey.substring(0, 60) + "...",
              });
            }
            setLoading(false);
            return;
          }
          
          // CRITICAL: If the new SVG is identical to an existing cached SVG for a DIFFERENT gotchi,
          // don't cache it. This prevents cache pollution where one gotchi's SVG overwrites another's.
          // Check all cache entries to see if this SVG already exists for a different gotchi
          let svgAlreadyCachedForDifferentGotchi = false;
          for (const [cachedKey, cachedSvg] of clientSvgCache.entries()) {
            if (cachedSvg === data && cachedKey !== requestKey) {
              const cachedKeyParts = cachedKey.split("|");
              const cachedGotchiId = cachedKeyParts[0] || "";
              if (cachedGotchiId !== (gotchiId || "")) {
                // This exact SVG is already cached for a different gotchi
                svgAlreadyCachedForDifferentGotchi = true;
                if (process.env.NODE_ENV === "development") {
                  console.warn(`[GotchiSvg] SVG already cached for different gotchi ${cachedGotchiId} - not caching for ${gotchiId}`, {
                    requestKey: requestKey.substring(0, 60) + "...",
                    cachedKey: cachedKey.substring(0, 60) + "...",
                  });
                }
                break;
              }
            }
          }
          
          if (svgAlreadyCachedForDifferentGotchi && svg && svg !== data) {
            // Don't replace our existing SVG with one that's already used by another gotchi
            setLoading(false);
            return;
          }
          
          // Cache the result with the verified key
          clientSvgCache.set(requestKey, data);
          
          // Extract color signature to verify uniqueness
          if (process.env.NODE_ENV === "development") {
            // Try to find the outline color (usually in a path with specific attributes)
            // Look for stroke colors first (outlines), then fill colors
            const strokeMatch = data.match(/stroke="([^"]+)"/);
            const fillMatch = data.match(/fill="([^"]+)"/);
            const color = strokeMatch ? strokeMatch[1] : (fillMatch ? fillMatch[1] : "unknown");
            console.log(`[GotchiSvg] Setting SVG for ${gotchiId}`, {
              collateral: collateral?.substring(0, 20) + "...",
              requestKey: requestKey.substring(0, 60) + "...",
              svgColor: color.substring(0, 30),
              svgLength: data.length,
              isPlaceholder,
            });
          }
          
          // COMMIT GUARD: Never re-commit identical SVG (prevents repaint from StrictMode double-invoke)
          const svgHash = hashSvg(data);
          if (lastCommittedHashRef.current === svgHash && lockedSvgRef.current) {
            // Same SVG hash already committed - don't re-commit (idempotent under StrictMode)
            if (process.env.NODE_ENV === "development") {
              console.log(`[GotchiSvg] ${gotchiId} SVG hash unchanged - skipping commit (StrictMode-safe)`, {
                requestKey: requestKey.substring(0, 60) + "...",
                hash: svgHash,
              });
            }
            setLoading(false);
            return;
          }
          
          // CRITICAL: Only set SVG if we don't already have a LOCKED one for this exact requestKey
          // Once locked, NEVER replace it - this ensures each gotchi loads ONCE and stays stable
          if (!lockedSvgRef.current || previousRequestKeyRef.current !== requestKey) {
            setSvg(data);
            lockedSvgRef.current = data; // LOCK this SVG - prevents ALL future fetches for this gotchi
            previousRequestKeyRef.current = requestKey;
            lastCommittedHashRef.current = svgHash; // Track committed hash
            commitCountRef.current += 1; // Increment commit count for testing
            
            // Create blob URL if using blob URL rendering
            if (useBlobUrl) {
              // Revoke old blob URL if it exists
              if (blobUrlRef.current) {
                const oldUrl = blobUrlRef.current;
                const refCount = blobUrlRefCount.get(oldUrl) || 0;
                if (refCount <= 1) {
                  URL.revokeObjectURL(oldUrl);
                  blobUrlCache.delete(previousRequestKeyRef.current || "");
                  blobUrlRefCount.delete(oldUrl);
                } else {
                  blobUrlRefCount.set(oldUrl, refCount - 1);
                }
              }
              
              // Check if blob URL already exists in cache
              let blobUrl = blobUrlCache.get(requestKey);
              if (!blobUrl) {
                // Create new blob URL
                const blob = new Blob([data], { type: "image/svg+xml" });
                blobUrl = URL.createObjectURL(blob);
                blobUrlCache.set(requestKey, blobUrl);
                blobUrlRefCount.set(blobUrl, 1);
              } else {
                // Increment ref count for existing blob URL
                blobUrlRefCount.set(blobUrl, (blobUrlRefCount.get(blobUrl) || 0) + 1);
              }
              
              blobUrlRef.current = blobUrl;
              setBlobUrl(blobUrl);
            }
            
            if (process.env.NODE_ENV === "development") {
              const colorMatch = data.match(/stroke="([^"]+)"/) || data.match(/fill="([^"]+)"/);
              const color = colorMatch ? colorMatch[1] : "unknown";
              console.log(`[GotchiSvg] ${gotchiId} SVG LOCKED - will NEVER fetch again`, {
                requestKey: requestKey.substring(0, 60) + "...",
                svgColor: color.substring(0, 30),
                collateral: collateral?.substring(0, 20) + "...",
                commitCount: commitCountRef.current,
                useBlobUrl,
              });
            }
          } else {
            // We already have a LOCKED SVG for this requestKey - NEVER replace it
            if (process.env.NODE_ENV === "development") {
              console.warn(`[GotchiSvg] ${gotchiId} SVG already LOCKED - NOT replacing`, {
                requestKey: requestKey.substring(0, 60) + "...",
              });
            }
          }
          setLoading(false);
        }
      })
      .catch(() => {
        // On error: show skeleton, do NOT show fallback SVG
        if (mounted && requestId === requestIdRef.current) {
          setSvg(null);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [requestKey, gotchiId]); // CRITICAL: Only depend on requestKey and gotchiId to prevent multiple fetches

  // Cleanup blob URL on unmount or requestKey change
  useEffect(() => {
    return () => {
      if (blobUrlRef.current && useBlobUrl) {
        const url = blobUrlRef.current;
        const refCount = blobUrlRefCount.get(url) || 0;
        if (refCount <= 1) {
          URL.revokeObjectURL(url);
          blobUrlCache.delete(previousRequestKeyRef.current || "");
          blobUrlRefCount.delete(url);
        } else {
          blobUrlRefCount.set(url, refCount - 1);
        }
        blobUrlRef.current = null;
      }
    };
  }, [requestKey, useBlobUrl]);

  return (
    <div
      data-testid={testId || "gotchi-svg"}
      data-request-key={requestKey}
      data-gotchi-id={gotchiId}
      data-mode={mode}
      data-commit-count={commitCountRef.current}
      className={cn(
        "relative rounded-md bg-muted overflow-hidden flex items-center justify-center",
        className
      )}
    >
      {/* Skeleton: shown when svg is null */}
      {!svg && (
        <div 
          className="w-full h-full bg-muted/50 animate-pulse"
          data-testid={testId ? `${testId}-skeleton` : "gotchi-svg-skeleton"}
        />
      )}
      
      {/* Canonical SVG: use <img> with blob URL for Explorer, or dangerouslySetInnerHTML for other uses */}
      {svg && useBlobUrl && blobUrl && (
        <img
          src={blobUrl}
          alt={`Gotchi ${gotchiId}`}
          data-testid={testId ? `${testId}-content` : "gotchi-svg-content"}
          className="w-full h-full object-contain"
          data-commit-hash={lastCommittedHashRef.current}
        />
      )}
      
      {svg && !useBlobUrl && (
        <div
          data-testid={testId ? `${testId}-content` : "gotchi-svg-content"}
          className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}

