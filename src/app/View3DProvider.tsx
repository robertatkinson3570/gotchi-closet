import { createContext, useContext, useEffect, useMemo, useState } from "react";

type View3DContextValue = {
  /** Site-wide preference: render gotchis/wearables in 3D where a model exists. */
  enabled: boolean;
  toggle: () => void;
};

const View3DContext = createContext<View3DContextValue | null>(null);
const STORAGE_KEY = "gotchicloset-view3d";

/**
 * Site-wide 3D mode. Off by default (2D pixel art is the canonical look and
 * costs no extra bandwidth); the preference persists per browser. Surfaces
 * that have a 3D model honor it, everything else stays 2D silently.
 */
export function View3DProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch { /* private mode */ }
  }, []);

  const toggle = () =>
    setEnabled((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* private mode */ }
      return next;
    });

  const value = useMemo(() => ({ enabled, toggle }), [enabled]);
  return <View3DContext.Provider value={value}>{children}</View3DContext.Provider>;
}

export function useView3D(): View3DContextValue {
  const ctx = useContext(View3DContext);
  if (!ctx) throw new Error("useView3D must be used within View3DProvider");
  return ctx;
}
