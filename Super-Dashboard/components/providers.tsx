"use client";

import { useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
// Import adapters directly (not via @solana/wallet-adapter-wallets bundle) so
// we don't pull in the Trezor/Stellar/protobufjs vuln chain for adapters we
// never use. See .superstack/security-audit.md → npm audit triage.
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";

import "@solana/wallet-adapter-react-ui/styles.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "@/components/ui/sonner";
import { RPC_URL } from "@/lib/solana";
import { wagmiConfig } from "@/lib/evm/config";

export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient sits above WagmiProvider — wagmi consumes the same client.
  // useState pin keeps it stable across re-renders (StrictMode-safe).
  const [queryClient] = useState(() => new QueryClient());
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {/*
          Dual-wallet stack: Solana wallet adapter (identity / payment for
          native flow) and wagmi (payment for cross-chain advertiser
          deposits). Both providers are always mounted; wagmi stays dormant
          until the user explicitly opens RainbowKit. Critically, we DO NOT
          pass `autoConnect` to WagmiProvider — when both providers race for
          localStorage on first paint, EVM wins and Solana session is lost.
        */}
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider modalSize="compact">
            <ConnectionProvider endpoint={RPC_URL}>
              <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                  {children}
                  <Toaster position="top-right" richColors />
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
