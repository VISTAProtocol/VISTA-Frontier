"use client";

import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { type State, WagmiProvider, useAccount } from "wagmi";

import { Toaster } from "@/components/ui/sonner";
import { baseNetwork, wagmiConfig } from "@/lib/wagmi";

function AccountWatcher() {
  const { address } = useAccount();
  const previousAddress = useRef(address);
  const hasHydrated = useRef(false);

  useEffect(() => {
    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) {
      previousAddress.current = address;
      return;
    }

    if (
      previousAddress.current &&
      address &&
      previousAddress.current !== address
    ) {
      // Wallet address was changed in the provider extension
      window.location.reload();
    }
    previousAddress.current = address;
  }, [address]);

  return null;
}

function RainbowShell({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = useMemo(
    () =>
      mounted && resolvedTheme === "dark"
        ? darkTheme({
            accentColor: "#39b976",
            borderRadius: "small",
          })
        : lightTheme({
            accentColor: "#39b976",
            borderRadius: "small",
          }),
    [mounted, resolvedTheme],
  );

  return (
    <RainbowKitProvider
      appInfo={{
        appName: "VISTA Protocol",
        learnMoreUrl: "https://sepolia.basescan.org",
      }}
      initialChain={baseNetwork}
      modalSize="compact"
      theme={theme}
    >
      <AccountWatcher />
      {children}
      <Toaster position="top-right" richColors />
    </RainbowKitProvider>
  );
}

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={wagmiConfig} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          <RainbowShell>{children}</RainbowShell>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
