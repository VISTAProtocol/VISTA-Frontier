"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/**
 * Solana wallet hook with a wagmi-shaped surface.
 *
 * Pages across the dashboard previously consumed `useAccount` from wagmi and
 * `useConnectModal` from rainbowkit. This hook exposes the same field names
 * so we can migrate pages with minimal diff: `address` is now a base58
 * Solana pubkey instead of a 0x EVM address; `isConnected`/`status` semantics
 * preserved.
 */
export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "connected";

export interface UseVistaWallet {
  address: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  status: WalletStatus;
  openConnectModal: (() => void) | undefined;
  disconnect: () => Promise<void>;
}

export function useVistaWallet(): UseVistaWallet {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const status: WalletStatus = connecting
    ? "connecting"
    : connected
      ? "connected"
      : "disconnected";

  return {
    address: publicKey ? publicKey.toBase58() : undefined,
    isConnected: connected,
    isConnecting: connecting,
    isDisconnected: !connected && !connecting,
    status,
    openConnectModal: connected ? undefined : () => setVisible(true),
    disconnect: async () => {
      await disconnect();
    },
  };
}
