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
import { useEffect, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";

import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { UsdcCounter } from "@/components/usdc-counter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson } from "@/lib/http";
import { contractAddresses, vistaVaultAbi } from "@/lib/contracts";
import {
  getBridgeFee,
  normalizeBridgeOptions,
  normalizeReceiverBytes32,
} from "@/lib/bridge";
import type { UserDashboardData } from "@/lib/types";
import { formatDateTime, formatUsdc } from "@/lib/utils";
import { formatEther } from "viem";

export default function UserDashboardPage() {
  const { address } = useAccount();
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<number | null>(null);
  const [bridgeReceiptId, setBridgeReceiptId] = useState<string>("");
  const [bridgeDstEid, setBridgeDstEid] = useState<string>("");
  const [bridgeReceiver, setBridgeReceiver] = useState<string>(
    process.env.NEXT_PUBLIC_VISTA_BRIDGE_RECEIVER ?? "",
  );
  const [bridgeOptions, setBridgeOptions] = useState<string>("0x");
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const {
    writeContract,
    data: withdrawTxHash,
    isPending: isWithdrawPending,
    error: withdrawError,
    reset: resetWithdraw,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isWithdrawn } =
    useWaitForTransactionReceipt({ hash: withdrawTxHash });

  const {
    writeContract: writeBridgeClaim,
    data: bridgeTxHash,
    isPending: isBridgePending,
    error: bridgeTxError,
    reset: resetBridge,
  } = useWriteContract();
  const { isLoading: isBridgeConfirming, isSuccess: isBridgeConfirmed } =
    useWaitForTransactionReceipt({ hash: bridgeTxHash });

  const { data: onChainBalance, refetch: refetchBalance } = useReadContract({
    address: contractAddresses.vistaVault ?? undefined,
    abi: vistaVaultAbi,
    functionName: "getBalance",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && contractAddresses.vistaVault) },
  });

  const receiverBytes32 = normalizeReceiverBytes32(bridgeReceiver);
  const bridgeOptionsBytes = normalizeBridgeOptions(bridgeOptions);
  let parsedReceiptId: bigint | null = null;
  try {
    parsedReceiptId = bridgeReceiptId ? BigInt(bridgeReceiptId) : null;
  } catch {
    parsedReceiptId = null;
  }
  const parsedDstEid = bridgeDstEid ? Number(bridgeDstEid) : null;
  const dstEidValid =
    parsedDstEid != null &&
    Number.isInteger(parsedDstEid) &&
    parsedDstEid >= 0 &&
    parsedDstEid <= 0xffffffff;
  const canQuoteBridge =
    Boolean(
      contractAddresses.vistaVault &&
        address &&
        parsedReceiptId != null &&
        parsedDstEid != null &&
        receiverBytes32,
    ) &&
    dstEidValid;

  const { data: bridgeQuote } = useReadContract({
    address: contractAddresses.vistaVault ?? undefined,
    abi: vistaVaultAbi,
    functionName: "quoteBridgeClaim",
    args:
      canQuoteBridge && receiverBytes32 && parsedReceiptId != null && parsedDstEid != null
        ? [parsedReceiptId, parsedDstEid, receiverBytes32, bridgeOptionsBytes]
        : undefined,
    account: address ?? undefined,
    query: { enabled: canQuoteBridge },
  });

  const resolvedQuote = getBridgeFee(bridgeQuote);

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

  useEffect(() => {
    if (isWithdrawn && withdrawAmount && data) {
      // Update totalWithdrawn optimistically for better UX (convert from base units to USDC precisely)
      const withdrawnUsdc = Number(BigInt(withdrawAmount) / BigInt(1_000_000));
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
      void refetchBalance();
    }
  }, [isWithdrawn, withdrawAmount, data, refetchBalance]);

  useEffect(() => {
    if (!isWithdrawn || !withdrawAmount || !address) return;

    let cancelled = false;

    async function recordWithdrawal() {
      try {
        await fetchJson("/api/vault/record-withdrawal", {
          method: "POST",
          body: JSON.stringify({
            walletAddress: address,
            amount: withdrawAmount! / 1_000_000,
            withdrawnAt: new Date().toISOString(),
          }),
        });
        if (!cancelled) setWithdrawAmount(null);
      } catch (err) {
        console.error("Failed to record withdrawal:", err);
      }
    }

    void recordWithdrawal();

    return () => {
      cancelled = true;
    };
  }, [isWithdrawn, withdrawAmount, address]);

  function handleWithdraw() {
    if (!contractAddresses.vistaVault) return;
    const currentBalance = Number(onChainBalance ?? 0);
    setWithdrawAmount(currentBalance);
    resetWithdraw();
    writeContract({
      address: contractAddresses.vistaVault,
      abi: vistaVaultAbi,
      functionName: "withdraw",
    });
  }

  function handleBridgeClaim() {
    if (!contractAddresses.vistaVault) return;
    if (!parsedReceiptId || parsedDstEid == null || !receiverBytes32) {
      setBridgeError("Provide receipt token ID, destination EID, and receiver.");
      return;
    }
    if (!resolvedQuote) {
      setBridgeError("Quote unavailable. Check inputs and try again.");
      return;
    }

    setBridgeError(null);
    resetBridge();
    writeBridgeClaim({
      address: contractAddresses.vistaVault,
      abi: vistaVaultAbi,
      functionName: "requestBridgeClaim",
      args: [
        parsedReceiptId,
        parsedDstEid,
        receiverBytes32,
        bridgeOptionsBytes,
      ],
      value: resolvedQuote.nativeFee,
    });
  }

  if (error) {
    return <LoadingScreen description={`Error: ${error}`} />;
  }

  if (!data || !address) {
    return (
      <LoadingScreen description="Syncing your verified earnings, receipts, and live session counter." />
    );
  }

  // on-chain balance is in USDC base units (6 decimals)
  const vaultBalanceRaw = Number(onChainBalance ?? 0);
  const hasVaultBalance = vaultBalanceRaw > 0;
  const isWithdrawing = isWithdrawPending || isConfirming;

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
                {formatUsdc(vaultBalanceRaw / 1_000_000)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  USDC
                </span>
              </p>
              <div className="mt-3 flex gap-6 text-sm text-muted-foreground"></div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={handleWithdraw}
                disabled={
                  !hasVaultBalance ||
                  isWithdrawing ||
                  !contractAddresses.vistaVault
                }
                size="lg"
              >
                {isWithdrawing ? (
                  <>
                    <ArrowDownToLine className="animate-pulse" />
                    {isConfirming ? "Confirming…" : "Withdrawing…"}
                  </>
                ) : (
                  <>
                    <Wallet />
                    Withdraw to wallet
                  </>
                )}
              </Button>
              {isWithdrawn && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Withdrawal confirmed!
                </p>
              )}
              {withdrawError && (
                <p className="max-w-xs text-right text-xs text-destructive">
                  {withdrawError.message.split("\n")[0]}
                </p>
              )}
              {!hasVaultBalance && !isWithdrawn && (
                <p className="text-xs text-muted-foreground">
                  No balance to withdraw
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Bridge your rewards
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Claim Vista tokens on another chain using your receipt NFT. You pay
              the bridge fee.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="receiptTokenId">Receipt token ID</Label>
              <Input
                id="receiptTokenId"
                placeholder="e.g. 12"
                value={bridgeReceiptId}
                onChange={(event) => setBridgeReceiptId(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destinationChain">Destination chain</Label>
              <Select
                value={bridgeDstEid}
                onValueChange={(value) => setBridgeDstEid(value)}
              >
                <SelectTrigger className="w-full" id="destinationChain">
                  <SelectValue placeholder="Select chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Custom / Unknown</SelectItem>
                  {process.env.NEXT_PUBLIC_LZ_EID_BASE ? (
                    <SelectItem value={process.env.NEXT_PUBLIC_LZ_EID_BASE}>
                      Base
                    </SelectItem>
                  ) : null}
                  {process.env.NEXT_PUBLIC_LZ_EID_ETH ? (
                    <SelectItem value={process.env.NEXT_PUBLIC_LZ_EID_ETH}>
                      Ethereum
                    </SelectItem>
                  ) : null}
                  {process.env.NEXT_PUBLIC_LZ_EID_MONAD ? (
                    <SelectItem value={process.env.NEXT_PUBLIC_LZ_EID_MONAD}>
                      Monad
                    </SelectItem>
                  ) : null}
                  {process.env.NEXT_PUBLIC_LZ_EID_SOLANA ? (
                    <SelectItem value={process.env.NEXT_PUBLIC_LZ_EID_SOLANA}>
                      Solana
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                placeholder="Destination EID (uint32)"
                value={bridgeDstEid}
                onChange={(event) => setBridgeDstEid(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="receiver">Bridge receiver (bytes32 or address)</Label>
              <Input
                id="receiver"
                placeholder="0x..."
                value={bridgeReceiver}
                onChange={(event) => setBridgeReceiver(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="options">LayerZero options (hex)</Label>
              <Input
                id="options"
                placeholder="0x"
                value={bridgeOptions}
                onChange={(event) => setBridgeOptions(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="space-y-1 text-muted-foreground">
              <p>
                Estimated fee:{" "}
                {resolvedQuote
                  ? `${formatEther(resolvedQuote.nativeFee)} native`
                  : "—"}
              </p>
              <p>
                Receiver bytes32:{" "}
                {receiverBytes32 ?? "Invalid receiver"}
              </p>
            </div>
            <Button
              onClick={handleBridgeClaim}
              disabled={!canQuoteBridge || isBridgePending || isBridgeConfirming}
              size="lg"
            >
              {isBridgePending || isBridgeConfirming
                ? "Bridging..."
                : "Bridge claim"}
            </Button>
          </div>
          {bridgeError && (
            <p className="text-xs text-destructive">{bridgeError}</p>
          )}
          {bridgeTxError && (
            <p className="text-xs text-destructive">
              {bridgeTxError.message.split("\n")[0]}
            </p>
          )}
          {isBridgeConfirmed && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Bridge request sent!
            </p>
          )}
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
