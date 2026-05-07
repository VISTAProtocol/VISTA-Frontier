"use client";

import {
  Coins,
  Flame,
  Layers3,
  Sparkles,
  TimerReset,
  Wallet,
  ArrowDownToLine,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { UsdcCounter } from "@/components/usdc-counter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchJson } from "@/lib/http";
import { USDC_DECIMALS } from "@/lib/solana";
import type { UserDashboardData } from "@/lib/types";
import { useVistaProgram } from "@/lib/use-vista-program";
import { useVistaWallet } from "@/lib/use-vista-wallet";
import { fetchUserBalance, withdraw } from "@/lib/vista-actions";
import { formatDateTime, formatUsdc } from "@/lib/utils";

export default function UserDashboardPage() {
  const { address } = useVistaWallet();
  const program = useVistaProgram();

  const [data, setData] = useState<UserDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vault balance in USDC base units (BigInt-safe), polled from chain.
  const [vaultBalanceRaw, setVaultBalanceRaw] = useState<bigint>(BigInt(0));
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [lastWithdrawTx, setLastWithdrawTx] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!program || !address) return;
    try {
      const bn = await fetchUserBalance(program, new PublicKey(address));
      setVaultBalanceRaw(bn ? BigInt(bn.toString()) : BigInt(0));
    } catch (err) {
      console.warn("[user-dashboard] fetchUserBalance failed:", err);
    }
  }, [program, address]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const result = await fetchJson<UserDashboardData>(
          `/api/dashboard/user?wallet=${address}`,
        );
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard.",
          );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [address]);

  async function handleWithdraw() {
    if (!program || !address) return;
    setWithdrawError(null);
    setLastWithdrawTx(null);
    setIsWithdrawing(true);

    const amountAtoms = vaultBalanceRaw;

    try {
      const sig = await withdraw(program, new PublicKey(address));
      setLastWithdrawTx(sig);

      try {
        await fetchJson("/api/vault/record-withdrawal", {
          method: "POST",
          body: JSON.stringify({
            walletAddress: address,
            amount: Number(amountAtoms) / 10 ** USDC_DECIMALS,
            withdrawnAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.warn("[user-dashboard] record-withdrawal failed:", err);
      }

      // Optimistic local UI: bump totalWithdrawn so the stat card reflects
      // immediately, even before the API reply round-trips.
      const withdrawnUsdc = Number(amountAtoms) / 10 ** USDC_DECIMALS;
      setData((prev) =>
        prev
          ? {
              ...prev,
              vault: {
                ...prev.vault,
                totalWithdrawn: prev.vault.totalWithdrawn + withdrawnUsdc,
              },
            }
          : null,
      );
      toast.success("Withdrawal confirmed.");
      await refreshBalance();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setWithdrawError(message);
      toast.error(`Withdraw failed: ${message.split("\n")[0]}`);
    } finally {
      setIsWithdrawing(false);
    }
  }

  if (error) {
    return <LoadingScreen description={`Error: ${error}`} />;
  }

  if (!data || !address) {
    return (
      <LoadingScreen description="Syncing your verified earnings, receipts, and live session counter." />
    );
  }

  const hasVaultBalance = vaultBalanceRaw > BigInt(0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User dashboard"
        title="Your attention stream"
        description="See your live session earnings tick upward and review how much verified attention has settled to this wallet."
      />

      <UsdcCounter
        initialAmount={data.liveSession.currentAmount}
        initialRatePerSecond={data.liveSession.ratePerSecond}
        initialSessionId={data.liveSession.sessionId}
        initialSessionSeconds={data.liveSession.sessionSeconds}
        initialVerified={data.liveSession.verified}
        walletAddress={address}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Coins}
          title="Total USDC withdrawn"
          value={data.vault.totalWithdrawn}
          format="usdc"
        />
        <StatCard
          icon={Sparkles}
          title="Attention score"
          value={`${(data.stats.attentionScore * 100).toFixed(1)}%`}
          hint={`Updated ${formatDateTime(data.stats.attentionUpdatedAt)}`}
        />
        <StatCard
          icon={Layers3}
          title="Sessions completed"
          value={data.stats.totalSessionsCompleted}
        />
        <StatCard
          icon={TimerReset}
          title="Total seconds verified"
          value={data.stats.totalSecondsVerified}
        />
        <StatCard
          icon={Flame}
          title="Favorite category"
          value={0}
          hint={data.stats.favoriteAdCategory}
        />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Vault balance
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {formatUsdc(Number(vaultBalanceRaw) / 10 ** USDC_DECIMALS)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  USDC
                </span>
              </p>
              <div className="mt-3 flex gap-6 text-sm text-muted-foreground"></div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={handleWithdraw}
                disabled={!hasVaultBalance || isWithdrawing || !program}
                size="lg"
              >
                {isWithdrawing ? (
                  <>
                    <ArrowDownToLine className="animate-pulse" />
                    Withdrawing…
                  </>
                ) : (
                  <>
                    <Wallet />
                    Withdraw to wallet
                  </>
                )}
              </Button>
              {lastWithdrawTx && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Withdrawal confirmed!
                </p>
              )}
              {withdrawError && (
                <p className="max-w-xs text-right text-xs text-destructive">
                  {withdrawError.split("\n")[0]}
                </p>
              )}
              {!hasVaultBalance && !lastWithdrawTx && (
                <p className="text-xs text-muted-foreground">
                  No balance to withdraw
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Verification status
            </p>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              The counter listens to the Oracle WebSocket and smoothly animates
              between ticks so session earnings keep climbing even during the
              10-second gap between proofs.
            </p>
          </div>
          <Badge variant={data.liveSession.verified ? "default" : "outline"}>
            {data.liveSession.verified
              ? "Attention verified"
              : "Waiting for active session"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
