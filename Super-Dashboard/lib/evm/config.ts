"use client";

/**
 * Client-only wagmi/RainbowKit config. The pure chain metadata
 * (`EVM_CHAINS`, `SupportedEvmChainKey`, `EvmChainMeta`) lives in
 * [./chains](./chains) so server routes can import it without dragging
 * RainbowKit into the server bundle.
 */
import { http } from "wagmi";
import {
  arbitrumSepolia,
  baseSepolia,
  monadTestnet,
  optimismSepolia,
  polygonAmoy,
} from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export {
  EVM_CHAINS,
  type EvmChainMeta,
  type SupportedEvmChainKey,
} from "./chains";

const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vista-protocol-dev";

/// Wagmi/RainbowKit config. Built once at module load — `getDefaultConfig`
/// returns a stable object so React strict-mode double-mount is fine.
export const wagmiConfig = getDefaultConfig({
  appName: "VISTA Protocol",
  projectId: WC_PROJECT_ID,
  chains: [
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    polygonAmoy,
    monadTestnet,
  ],
  transports: {
    [baseSepolia.id]: http(
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC ?? undefined,
    ),
    [arbitrumSepolia.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC ?? undefined,
    ),
    [optimismSepolia.id]: http(
      process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC ?? undefined,
    ),
    [polygonAmoy.id]: http(
      process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC ?? undefined,
    ),
    [monadTestnet.id]: http(
      process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC ?? undefined,
    ),
  },
  /// SSR-safe — Next App Router renders providers on the server first.
  ssr: true,
});
