import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { isValidAddress, normalizeAddress } from "@/lib/address";
import { BASE_CHAIN_ID } from "@/lib/chains";

type AddressSource = "connected" | "manual";

type AddressState = {
  connectedAddress: string | null;
  isConnected: boolean;
  chainId?: number;
  isOnBase: boolean;
  activeAddress: string;
  source: AddressSource;
  setManualAddress: (address: string) => void;
  useConnectedAddress: () => void;
};

const STORAGE_ACTIVE = "gc_activeAddress";
const STORAGE_SOURCE = "gc_activeSource";

const AddressContext = createContext<AddressState | null>(null);

function readStoredValue(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value ?? fallback;
}

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;

  const [activeAddress, setActiveAddress] = useState(() => {
    const stored = readStoredValue(STORAGE_ACTIVE, "");
    return isValidAddress(stored) ? normalizeAddress(stored) : "";
  });
  const [source, setSource] = useState<AddressSource>(() => {
    const stored = readStoredValue(STORAGE_SOURCE, "manual");
    return stored === "connected" ? "connected" : "manual";
  });

  const prevIsConnectedRef = useRef(isConnected);
  const prevConnectedRef = useRef<string | null>(
    address ? normalizeAddress(address) : null
  );
  const activeAddressRef = useRef(activeAddress);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_ACTIVE, activeAddress);
  }, [activeAddress]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_SOURCE, source);
  }, [source]);

  useEffect(() => {
    activeAddressRef.current = activeAddress;
  }, [activeAddress]);

  useEffect(() => {
    const normalized = address ? normalizeAddress(address) : null;
    const wasConnected = prevIsConnectedRef.current;
    const prevAddress = prevConnectedRef.current;

    if (!isConnected) {
      prevIsConnectedRef.current = isConnected;
      prevConnectedRef.current = normalized;
      return;
    }

    const justConnected = !wasConnected && isConnected;

    if (justConnected && isOnBase && normalized) {
      if (source !== "manual" || !activeAddressRef.current) {
        setActiveAddress(normalized);
        setSource("connected");
      }
    } else if (
      wasConnected &&
      normalized &&
      normalized !== prevAddress &&
      source === "connected"
    ) {
      setActiveAddress(normalized);
    }

    prevIsConnectedRef.current = isConnected;
    prevConnectedRef.current = normalized;
  }, [isConnected, isOnBase, address, source]);

  const setManualAddress = (input: string) => {
    if (!isValidAddress(input)) return;
    setActiveAddress(normalizeAddress(input));
    setSource("manual");
  };

  const useConnectedAddress = () => {
    if (!address) return;
    setActiveAddress(normalizeAddress(address));
    setSource("connected");
  };

  const value = useMemo(
    () => ({
      connectedAddress: address ?? null,
      isConnected,
      chainId,
      isOnBase,
      activeAddress,
      source,
      setManualAddress,
      useConnectedAddress,
    }),
    [
      address,
      isConnected,
      chainId,
      isOnBase,
      activeAddress,
      source,
    ]
  );

  return (
    <AddressContext.Provider value={value}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddressState() {
  const ctx = useContext(AddressContext);
  if (!ctx) {
    throw new Error("useAddressState must be used within AddressProvider");
  }
  return ctx;
}

