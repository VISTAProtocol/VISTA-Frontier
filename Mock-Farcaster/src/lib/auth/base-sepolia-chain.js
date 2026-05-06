import { defineChain } from "viem";
import {
  BASE_CHAIN_ID as SDK_BASE_CHAIN_ID,
  BASE_RPC_URL as SDK_BASE_RPC_URL,
  BASE_EXPLORER_URL as SDK_BASE_EXPLORER_URL,
} from "vista-protocol";

function parseChainId(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : SDK_BASE_CHAIN_ID;
}

export const BASE_CHAIN_ID = parseChainId(
  process.env.NEXT_PUBLIC_BASE_CHAIN_ID,
);

export const baseSepoliaChain = defineChain({
  id: BASE_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_BASE_RPC_URL || SDK_BASE_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: process.env.NEXT_PUBLIC_BASE_EXPLORER_URL || SDK_BASE_EXPLORER_URL,
    },
  },
  testnet: true,
});
