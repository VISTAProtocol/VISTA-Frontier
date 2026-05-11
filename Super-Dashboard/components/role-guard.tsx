"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { ConnectWalletGate } from "@/components/connect-wallet-gate";
import { LoadingScreen } from "@/components/loading-screen";
import { fetchJson } from "@/lib/http";
import type { RoleName } from "@/lib/types";
import { useVistaWallet } from "@/lib/use-vista-wallet";

/// SessionStorage TTL for the cached role-status answer. Short enough to
/// catch real registration changes (a user just onboarded), long enough that
/// flipping between tabs / role pages does not re-blank the screen on every
/// network round trip.
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

interface CachedStatus {
  wallet: string;
  role: RoleName;
  registered: boolean;
  ts: number;
}

function cacheKey(role: RoleName, wallet: string) {
  return `vista.role-status:${role}:${wallet.toLowerCase()}`;
}

function readCache(role: RoleName, wallet: string): CachedStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(role, wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStatus;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedStatus) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      cacheKey(entry.role, entry.wallet),
      JSON.stringify(entry),
    );
  } catch {
    /* ignore */
  }
}

export function RoleGuard({
  role,
  requireRegistration,
  redirectIfRegisteredTo,
  children,
}: {
  role: RoleName;
  requireRegistration?: boolean;
  redirectIfRegisteredTo?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const {
    address: solanaAddress,
    isConnected: solanaConnected,
    status: solanaStatus,
  } = useVistaWallet();
  const { address: evmAddress, status: evmStatus } = useAccount();

  /// Advertiser routes settle through Solana under the hood but accept EVM
  /// wallets at deposit time. All other roles are Solana-only — the
  /// settlement contract has no EVM-side identity for them.
  const allowsEvm = role === "advertiser";

  /// Resolve which wallet (if any) the user has connected for this role.
  /// Solana takes precedence whenever it's present so a single user with
  /// both Phantom and MetaMask logged in still falls into the existing
  /// Solana-first registration record.
  const activeWallet: string | undefined = solanaConnected
    ? solanaAddress
    : allowsEvm && evmAddress
      ? evmAddress
      : undefined;

  const isWaitingForAdapter =
    solanaStatus === "connecting" ||
    solanaStatus === "reconnecting" ||
    (allowsEvm && (evmStatus === "connecting" || evmStatus === "reconnecting"));

  const [canRender, setCanRender] = useState(false);
  const [checking, setChecking] = useState(true);

  const redirectingRef = useRef(false);
  const lastResolvedRef = useRef<{ wallet: string; role: RoleName } | null>(
    null,
  );

  useEffect(() => {
    if (redirectingRef.current) return;

    /// Wallet missing — defer if the adapter is still rehydrating so we
    /// don't flicker the connect prompt on every cold load. Otherwise
    /// surface the inline connect prompt below.
    if (!activeWallet) {
      if (isWaitingForAdapter) {
        return;
      }
      setCanRender(false);
      setChecking(false);
      return;
    }

    if (!requireRegistration && !redirectIfRegisteredTo) {
      setCanRender(true);
      setChecking(false);
      return;
    }

    const cached = readCache(role, activeWallet);
    if (cached) {
      if (requireRegistration && !cached.registered) {
        redirectingRef.current = true;
        routerRef.current.replace(`/${role}/onboarding`);
        return;
      }
      if (redirectIfRegisteredTo && cached.registered) {
        redirectingRef.current = true;
        routerRef.current.replace(redirectIfRegisteredTo);
        return;
      }
      setCanRender(true);
      setChecking(false);
      lastResolvedRef.current = { wallet: activeWallet, role };
    } else if (
      lastResolvedRef.current?.wallet === activeWallet &&
      lastResolvedRef.current.role === role
    ) {
      setCanRender(true);
      setChecking(false);
    } else {
      setCanRender(false);
      setChecking(true);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS,
    );
    let cancelled = false;

    async function revalidate() {
      try {
        const result = await fetchJson<{ registered: boolean }>(
          `/api/roles/status?role=${role}&wallet=${activeWallet}`,
          { signal: controller.signal },
        );

        if (cancelled) return;
        writeCache({
          wallet: activeWallet!,
          role,
          registered: result.registered,
          ts: Date.now(),
        });

        if (requireRegistration && !result.registered) {
          redirectingRef.current = true;
          routerRef.current.replace(`/${role}/onboarding`);
          return;
        }
        if (redirectIfRegisteredTo && result.registered) {
          redirectingRef.current = true;
          routerRef.current.replace(redirectIfRegisteredTo);
          return;
        }

        lastResolvedRef.current = { wallet: activeWallet!, role };
        setCanRender(true);
        setChecking(false);
      } catch (err) {
        if (cancelled) return;
        if (cached || lastResolvedRef.current) {
          setChecking(false);
          return;
        }
        console.warn("[role-guard] revalidate failed:", err);
        setCanRender(false);
        setChecking(false);
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void revalidate();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
    /// router intentionally excluded — see routerRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeWallet,
    isWaitingForAdapter,
    redirectIfRegisteredTo,
    requireRegistration,
    role,
  ]);

  if (!activeWallet) {
    if (isWaitingForAdapter) {
      return (
        <LoadingScreen
          description="Restoring your wallet session…"
          offerReload
        />
      );
    }
    return <ConnectWalletGate role={role} />;
  }

  if (!canRender || checking) {
    return (
      <LoadingScreen
        description="Checking wallet connection and role access."
        offerReload
      />
    );
  }

  return <>{children}</>;
}
