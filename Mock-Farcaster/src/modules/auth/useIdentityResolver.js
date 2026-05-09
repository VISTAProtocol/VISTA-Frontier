"use client";

import { useEffect, useState } from "react";

/**
 * Looks up a wallet's Solana primary identity via the dashboard's public
 * resolver. Used to preview "settling to Solana primary X..." in the UI
 * BEFORE a session starts, so the user sees where their attention will land.
 *
 * The oracle-node performs the same resolution server-side at heartbeat
 * time — this hook is purely for UX clarity.
 */
export function useIdentityResolver(wallet) {
  const [state, setState] = useState({
    loading: false,
    primaryWallet: null,
    isPrimary: false,
    sourceChain: null,
    error: null,
  });

  useEffect(() => {
    if (!wallet) {
      setState({
        loading: false,
        primaryWallet: null,
        isPrimary: false,
        sourceChain: null,
        error: null,
      });
      return;
    }

    const dashboardUrl =
      process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ?? "http://localhost:3031";
    const url = `${dashboardUrl}/api/identity/resolve?wallet=${encodeURIComponent(wallet)}`;

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch(url)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setState({
            loading: false,
            primaryWallet: null,
            isPrimary: false,
            sourceChain: null,
            error: json?.error ?? `Resolve failed (${r.status})`,
          });
          return;
        }
        setState({
          loading: false,
          primaryWallet: json.primaryWallet,
          isPrimary: json.isPrimary,
          sourceChain: json.sourceChain,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          primaryWallet: null,
          isPrimary: false,
          sourceChain: null,
          error: err?.message ?? "Network error.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return state;
}
