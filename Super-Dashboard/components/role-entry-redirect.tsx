"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { ConnectWalletGate } from "@/components/connect-wallet-gate";
import { LoadingScreen } from "@/components/loading-screen";
import { roleMeta } from "@/lib/constants";
import { fetchJson } from "@/lib/http";
import type { RoleName } from "@/lib/types";
import { useVistaWallet } from "@/lib/use-vista-wallet";

export function RoleEntryRedirect({ role }: { role: RoleName }) {
  const router = useRouter();
  // Stable ref so router never re-triggers the effect.
  const routerRef = useRef(router);
  routerRef.current = router;

  const {
    address: solanaAddress,
    isConnected: solanaConnected,
    status: solanaStatus,
  } = useVistaWallet();
  const { address: evmAddress, status: evmStatus } = useAccount();

  /// Same role-wallet pairing rule as RoleGuard: every role accepts Solana,
  /// advertiser additionally accepts EVM. Solana wins ties.
  const allowsEvm = role === "advertiser";
  const activeWallet: string | undefined = solanaConnected
    ? solanaAddress
    : allowsEvm && evmAddress
      ? evmAddress
      : undefined;
  const isWaitingForAdapter =
    solanaStatus === "connecting" ||
    solanaStatus === "reconnecting" ||
    (allowsEvm && (evmStatus === "connecting" || evmStatus === "reconnecting"));

  // Prevent the effect from firing twice when a redirect is already in flight.
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (redirectingRef.current) return;
    if (isWaitingForAdapter) return;
    if (!activeWallet) return;

    let cancelled = false;

    async function resolveDestination() {
      let statusRes: { registered: boolean };
      try {
        statusRes = await fetchJson<{ registered: boolean }>(
          `/api/roles/status?role=${role}&wallet=${activeWallet}`,
        );
      } catch {
        if (!cancelled) {
          redirectingRef.current = true;
          routerRef.current.replace(
            roleMeta[role].onboardingPath,
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallet, isWaitingForAdapter, role]);

  if (!activeWallet) {
    if (isWaitingForAdapter) {
      return (
        <LoadingScreen
          title={`Opening ${roleMeta[role].label} workspace`}
          description="Restoring your wallet session…"
          offerReload
        />
      );
    }
    return <ConnectWalletGate role={role} />;
  }

  return (
    <LoadingScreen
      title={`Opening ${roleMeta[role].label} workspace`}
      description="Routing you to the correct step based on this wallet."
      offerReload
    />
  );
}
