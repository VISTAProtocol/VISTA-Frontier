/**
 * Pure chain metadata — server-safe. The wagmi/RainbowKit `getDefaultConfig`
 * call lives in `./config.ts` and is client-only; importing it from a server
 * route pulls RainbowKit's React tree into the server bundle and crashes
 * the build with "Attempted to call getDefaultConfig() from the server".
 *
 * Server routes (e.g. /api/identity/link/challenge) should import from this
 * file. Client components can import from either.
 */
import {
  arbitrumSepolia,
  baseSepolia,
  monadTestnet,
  optimismSepolia,
  polygonAmoy,
  type Chain,
} from "wagmi/chains";

export type SupportedEvmChainKey =
  | "base-sepolia"
  | "arbitrum-sepolia"
  | "optimism-sepolia"
  | "polygon-amoy"
  | "monad-testnet";

export interface EvmChainMeta {
  key: SupportedEvmChainKey;
  chain: Chain;
  /// Native USDC address on this chain.
  usdc: `0x${string}`;
  /// Deployed VistaGateway address (set after `forge script`).
  vistaGateway: `0x${string}` | undefined;
  /// LayerZero V2 endpoint id (informational; the gateway carries the value).
  lzEid: number;
  /// Circle CCTP domain id — required for VistaGateway.depositCampaign and
  /// for oracle-node CCTP attestation polling. Solana = 5.
  cctpDomain: number;
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
    cctpDomain: 6,
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
    cctpDomain: 3,
    label: "Arbitrum Sepolia",
    explorerTx: "https://sepolia.arbiscan.io/tx/",
  },
  // The chains below need a VistaGateway deployment + env var set
  // (NEXT_PUBLIC_VISTA_GATEWAY_<CHAIN>) before the cross-chain deposit
  // flow will work. UI shows them in the chain selector but flags as
  // "not configured" until the env is provided.
  "optimism-sepolia": {
    key: "optimism-sepolia",
    chain: optimismSepolia,
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    vistaGateway: process.env.NEXT_PUBLIC_VISTA_GATEWAY_OPTIMISM_SEPOLIA as
      | `0x${string}`
      | undefined,
    lzEid: 40232,
    cctpDomain: 2,
    label: "Optimism Sepolia",
    explorerTx: "https://sepolia-optimism.etherscan.io/tx/",
  },
  "polygon-amoy": {
    key: "polygon-amoy",
    chain: polygonAmoy,
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    vistaGateway: process.env.NEXT_PUBLIC_VISTA_GATEWAY_POLYGON_AMOY as
      | `0x${string}`
      | undefined,
    lzEid: 40267,
    cctpDomain: 7,
    label: "Polygon Amoy",
    explorerTx: "https://amoy.polygonscan.com/tx/",
  },
  // Monad: CCTP support not yet confirmed on testnet. UI lists for future
  // deploy; advertiser flow will warn if cctpDomain = -1.
  "monad-testnet": {
    key: "monad-testnet",
    chain: monadTestnet,
    usdc: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
    vistaGateway: process.env.NEXT_PUBLIC_VISTA_GATEWAY_MONAD_TESTNET as
      | `0x${string}`
      | undefined,
    lzEid: 40204,
    cctpDomain: -1,
    label: "Monad Testnet (CCTP TBD)",
    explorerTx: "https://testnet.monadexplorer.com/tx/",
  },
};
