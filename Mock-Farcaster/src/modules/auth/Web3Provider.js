"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { baseSepoliaChain } from "@/lib/auth/base-sepolia-chain";

function getInjectedProviders() {
  if (typeof window === "undefined") {
    return [];
  }

  const ethereum = window.ethereum;
  if (!ethereum) {
    return [];
  }

  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    return ethereum.providers;
  }

  return [ethereum];
}

function pickProvider(predicate) {
  return () => {
    const providers = getInjectedProviders();
    const exact = providers.find(predicate);
    if (exact) {
      return exact;
    }

    return undefined;
  };
}

function isBraveBrowser() {
  return (
    typeof navigator !== "undefined" && typeof navigator.brave !== "undefined"
  );
}

function isBraveProvider(provider) {
  if (!provider) {
    return false;
  }

  if (provider.isBraveWallet || provider.isBraveWalletProvider) {
    return true;
  }

  const providerName = provider.providerInfo?.name;
  if (
    typeof providerName === "string" &&
    providerName.toLowerCase().includes("brave")
  ) {
    return true;
  }

  return false;
}

const wagmiConfig = createConfig({
  chains: [baseSepoliaChain],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [baseSepoliaChain.id]: http(baseSepoliaChain.rpcUrls.default.http[0]),
  },
});

export default function Web3Provider({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
