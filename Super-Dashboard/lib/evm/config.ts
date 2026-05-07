import { http, createConfig } from "wagmi";
import { baseSepolia, arbitrumSepolia, type Chain } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export type SupportedEvmChainKey = "base-sepolia" | "arbitrum-sepolia";

export interface EvmChainMeta {
  key: SupportedEvmChainKey;
  chain: Chain;
  /// Native USDC address on this chain.
  usdc: `0x${string}`;
  /// Deployed VistaGateway address (set after `forge script`).
  vistaGateway: `0x${string}` | undefined;
  /// LayerZero V2 endpoint id (informational; the gateway carries the value).
  lzEid: number;
  /// Display label for the UI.
  label: string;
  /// Block explorer URL prefix.
  explorerTx: string;
}

export const EVM_CHAINS: Record<SupportedEvmChainKey, EvmChainMeta> = {
  "base-sepolia": {
    key: "base-sepolia",
    chain: baseSepolia,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    vistaGateway: process.env.NEXT_PUBLIC_VISTA_GATEWAY_BASE_SEPOLIA as
      | `0x${string}`
      | undefined,
    lzEid: 40245,
    label: "Base Sepolia",
    explorerTx: "https://sepolia.basescan.org/tx/",
  },
  "arbitrum-sepolia": {
    key: "arbitrum-sepolia",
    chain: arbitrumSepolia,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    vistaGateway: process.env.NEXT_PUBLIC_VISTA_GATEWAY_ARB_SEPOLIA as
      | `0x${string}`
      | undefined,
    lzEid: 40231,
    label: "Arbitrum Sepolia",
    explorerTx: "https://sepolia.arbiscan.io/tx/",
  },
};

const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vista-protocol-dev";

/// Wagmi/RainbowKit config. Built once at module load — `getDefaultConfig`
/// returns a stable object so React strict-mode double-mount is fine.
export const wagmiConfig = getDefaultConfig({
  appName: "VISTA Protocol",
  projectId: WC_PROJECT_ID,
  chains: [baseSepolia, arbitrumSepolia],
  transports: {
    [baseSepolia.id]: http(
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC ?? undefined,
    ),
    [arbitrumSepolia.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC ?? undefined,
    ),
  },
  /// SSR-safe — Next App Router renders providers on the server first.
  ssr: true,
});
