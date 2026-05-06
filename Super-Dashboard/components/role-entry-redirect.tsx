"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { LoadingScreen } from "@/components/loading-screen";
import { roleMeta } from "@/lib/constants";
import { fetchJson } from "@/lib/http";
import type { RoleName } from "@/lib/types";

export function RoleEntryRedirect({ role }: { role: RoleName }) {
  const router = useRouter();
  // Stable ref so router never re-triggers the effect.
  const routerRef = useRef(router);
  routerRef.current = router;

  const { openConnectModal } = useConnectModal();
  const openConnectModalRef = useRef(openConnectModal);
  openConnectModalRef.current = openConnectModal;

  const { address, isConnected, status } = useAccount();
  // Prevent the effect from firing twice when a redirect is already in flight.
  const redirectingRef = useRef(false);

  useEffect(() => {
    // Don't re-run if we're already mid-redirect.
    if (redirectingRef.current) return;

    // Still waiting for wagmi to finish reconnecting from localStorage.
    if (status === "connecting" || status === "reconnecting") return;

    let cancelled = false;

    async function resolveDestination() {
      if (!isConnected || !address) {
        redirectingRef.current = true;
        routerRef.current.replace("/");
        // Delay slightly so the navigation can settle before opening the modal.
        // On mobile browsers without a wallet extension this is a no-op.
        setTimeout(() => {
          openConnectModalRef.current?.();
        }, 300);
        return;
      }

      let statusRes: { registered: boolean };
      try {
        statusRes = await fetchJson<{ registered: boolean }>(
          `/api/roles/status?role=${role}&wallet=${address}`,
        );
      } catch {
        if (!cancelled) {
          redirectingRef.current = true;
          routerRef.current.replace("/");
        }
        return;
      }

      if (cancelled) return;

      redirectingRef.current = true;
      routerRef.current.replace(
        statusRes.registered
          ? roleMeta[role].dashboardPath
          : roleMeta[role].onboardingPath,
      );
    }

    void resolveDestination();

    return () => {
      cancelled = true;
    };
    // NOTE: router and openConnectModal are intentionally omitted — we use refs
    // to avoid infinite re-runs that cause the LoadingScreen flash loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, role, status]);

  return (
    <LoadingScreen
      title={`Opening ${roleMeta[role].label} workspace`}
      description="Routing you to the correct step based on this wallet."
    />
  );
}
