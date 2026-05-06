"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { LoadingScreen } from "@/components/loading-screen";
import { fetchJson } from "@/lib/http";
import type { RoleName } from "@/lib/types";

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
  // Keep router in a ref so it never triggers re-runs of the effect.
  const routerRef = useRef(router);
  routerRef.current = router;

  const { openConnectModal } = useConnectModal();
  const openConnectModalRef = useRef(openConnectModal);
  openConnectModalRef.current = openConnectModal;

  const { address, isConnected, status } = useAccount();

  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [canRender, setCanRender] = useState(false);
  // Tracks whether a redirect has already been initiated to prevent re-running the effect.
  const redirectingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Don't re-run if we're already mid-redirect.
    if (redirectingRef.current) return;

    // Still waiting for wagmi to finish reconnecting from localStorage.
    if (status === "connecting" || status === "reconnecting") return;

    let cancelled = false;

    async function resolveAccess() {
      if (!isConnected || !address) {
        // User has no wallet connected. Redirect once, then stop.
        redirectingRef.current = true;
        routerRef.current.replace("/");
        // Only open the connect modal if we're in an environment that supports it
        // (i.e., a desktop browser with a wallet extension). On mobile browsers
        // without an injected provider, openConnectModal may still exist but
        // attempting to open it causes a loop. We guard with a short delay so
        // the router navigation can settle first.
        setTimeout(() => {
          openConnectModalRef.current?.();
        }, 300);
        return;
      }

      if (!requireRegistration && !redirectIfRegisteredTo) {
        if (!cancelled) {
          setCanRender(true);
          setChecking(false);
        }
        return;
      }

      try {
        const result = await fetchJson<{ registered: boolean }>(
          `/api/roles/status?role=${role}&wallet=${address}`,
        );

        if (cancelled) return;

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

        if (!cancelled) {
          setCanRender(true);
        }
      } catch {
        redirectingRef.current = true;
        routerRef.current.replace("/");
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    setChecking(true);
    setCanRender(false);
    void resolveAccess();

    return () => {
      cancelled = true;
    };
    // NOTE: router is intentionally excluded — we use routerRef to avoid
    // triggering this effect on every navigation, which causes the flash loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, mounted, redirectIfRegisteredTo, requireRegistration, role, status]);

  if (!mounted || checking || !canRender) {
    return (
      <LoadingScreen description="Checking wallet connection and role access." />
    );
  }

  return <>{children}</>;
}
