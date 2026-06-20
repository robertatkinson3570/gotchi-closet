import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { AddressProvider } from "@/lib/addressState";
import { queryClient } from "@/lib/queryClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AddressProvider>{children}</AddressProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

