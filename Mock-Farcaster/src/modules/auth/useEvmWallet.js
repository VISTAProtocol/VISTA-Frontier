"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Minimal `window.ethereum` wrapper — no wagmi/viem dep, just direct EIP-1193.
 * Sufficient for Mock-Farcaster's needs: get the user's connected EVM address
 * to pass to Vista SDK as `userWallet`. The oracle-node resolver maps it back
 * to the user's Solana primary identity via /api/identity/resolve.
 *
 * For production, swap this for wagmi + WalletConnect to support more than
 * MetaMask / injected providers.
 */
export function useEvmWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAvailable(Boolean(window.ethereum));
  }, []);

  // Subscribe to wallet events so the UI reflects user-side actions
  // (account switch in MetaMask, network change, disconnect).
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      setAddress(accounts?.[0] ?? null);
    };
    const handleChainChanged = (cid) => {
      setChainId(typeof cid === "string" ? parseInt(cid, 16) : Number(cid));
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    // Best-effort: pull current state without prompting connect dialog.
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts?.[0]) setAddress(accounts[0]);
      })
      .catch(() => {});
    window.ethereum
      .request({ method: "eth_chainId" })
      .then((cid) => setChainId(parseInt(cid, 16)))
      .catch(() => {});

    return () => {
      window.ethereum.removeListener?.(
        "accountsChanged",
        handleAccountsChanged,
      );
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No EVM wallet detected. Install MetaMask.");
      return null;
    }
    setError(null);
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const addr = accounts?.[0] ?? null;
      setAddress(addr);
      return addr;
    } catch (err) {
      setError(err?.message ?? "Failed to connect EVM wallet.");
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no programmatic disconnect — user does it from MetaMask.
    // We only clear local state; reconnecting requires explicit user approval.
    setAddress(null);
  }, []);

  return {
    address,
    chainId,
    available,
    connecting,
    error,
    connect,
    disconnect,
    isConnected: Boolean(address),
  };
}
