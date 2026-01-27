import { useEffect } from "react";
import { useAppStore } from "@/state/useAppStore";
import { fetchBaazaarPrices, getCachedBaazaarPrices } from "@/lib/baazaar";

export function useBaazaar() {
  const wearableMode = useAppStore((state) => state.filters.wearableMode);
  const baazaarPrices = useAppStore((state) => state.baazaarPrices);
  const baazaarLoading = useAppStore((state) => state.baazaarLoading);
  const baazaarError = useAppStore((state) => state.baazaarError);
  const setBaazaarPrices = useAppStore((state) => state.setBaazaarPrices);
  const setBaazaarLoading = useAppStore((state) => state.setBaazaarLoading);
  const setBaazaarError = useAppStore((state) => state.setBaazaarError);
  const setFilters = useAppStore((state) => state.setFilters);

  useEffect(() => {
    if (wearableMode !== "baazaar") return;

    const cached = getCachedBaazaarPrices();
    if (cached && Object.keys(cached).length > 0) {
      setBaazaarPrices(cached);
      return;
    }

    if (baazaarLoading) return;
    if (Object.keys(baazaarPrices).length > 0) return;

    setBaazaarLoading(true);
    setBaazaarError(null);

    fetchBaazaarPrices()
      .then((prices) => {
        setBaazaarPrices(prices);
        if (Object.keys(prices).length === 0) {
          setBaazaarError("No Baazaar listings found");
        }
      })
      .catch((err) => {
        setBaazaarError(err.message || "Failed to load Baazaar data");
        setFilters({ wearableMode: "all" });
      })
      .finally(() => {
        setBaazaarLoading(false);
      });
  }, [wearableMode, baazaarPrices, baazaarLoading, setBaazaarPrices, setBaazaarLoading, setBaazaarError, setFilters]);

  return {
    baazaarPrices,
    baazaarLoading,
    baazaarError,
    isBaazaarMode: wearableMode === "baazaar",
  };
}
