"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchJson } from "@/lib/http";
import { EVM_CHAINS, type SupportedEvmChainKey } from "@/lib/evm/config";
import type { BridgeStatus } from "@/lib/types";

interface BridgeStatusRow {
  campaign_id_onchain: string;
  source_chain: SupportedEvmChainKey | "solana-devnet" | null;
  bridge_status: BridgeStatus;
  cctp_nonce: number | null;
  source_chain_tx_hash: string | null;
  bridged_at: string | null;
}

interface Props {
  campaignIdOnchain: string;
  sourceChain: SupportedEvmChainKey;
  initialTxHash?: string;
}

const STAGES: Array<{ key: BridgeStatus; label: string; helpText: string }> = [
  {
    key: "initiated",
    label: "Awaiting EVM signature",
    helpText: "USDC approval + deposit pending in your wallet.",
  },
  {
    key: "evm_confirmed",
    label: "USDC burned via Circle CCTP",
    helpText: "Burn confirmed on source chain. Waiting for Circle attestation.",
  },
  {
    key: "cctp_attested",
    label: "Circle attestation ready",
    helpText:
      "USDC will be minted to the per-campaign vault on Solana. Typically 12–19 min on testnet.",
  },
  {
    key: "active",
    label: "Campaign active on Solana",
    helpText: "Users can now earn USDC against this campaign.",
  },
];

function indexOfStatus(status: BridgeStatus): number {
  // Treat 'solana_minted' as midway between attested and active.
  const order: BridgeStatus[] = [
    "native",
    "initiated",
    "evm_confirmed",
    "cctp_attested",
    "solana_minted",
    "active",
    "failed",
  ];
  return order.indexOf(status);
}

export function BridgeStatusPanel({
  campaignIdOnchain,
  sourceChain,
  initialTxHash,
}: Props) {
  const [row, setRow] = useState<BridgeStatusRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chain = EVM_CHAINS[sourceChain];

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await fetchJson<BridgeStatusRow>(
          `/api/bridge-status/${encodeURIComponent(campaignIdOnchain)}`,
        );
        if (!cancelled) setRow(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "poll failed");
        }
      }
    };
    void tick();
    const handle = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [campaignIdOnchain]);

  const status: BridgeStatus = row?.bridge_status ?? "initiated";
  const currentIdx = indexOfStatus(status);
  const failed = status === "failed";

  const txHash = row?.source_chain_tx_hash ?? initialTxHash;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>Cross-chain bridge status</CardTitle>
        <CardDescription>
          Funding from {chain.label} via Circle CCTP and LayerZero. Activation
          typically takes 12–19 minutes on testnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="space-y-3">
          {STAGES.map((stage, i) => {
            const reached = !failed && currentIdx >= indexOfStatus(stage.key);
            const isCurrent = !failed && status === stage.key;
            return (
              <li key={stage.key} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    reached
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {reached ? "✓" : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`font-medium ${isCurrent ? "text-primary" : ""}`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stage.helpText}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="space-y-1 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Source chain</span>
            <Badge variant="outline">{chain.label}</Badge>
          </div>
          {row?.cctp_nonce != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">CCTP nonce</span>
              <span className="font-mono">{row.cctp_nonce}</span>
            </div>
          )}
          {txHash && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Source tx</span>
              <a
                className="font-mono text-primary underline-offset-4 hover:underline"
                href={`${chain.explorerTx}${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {txHash.slice(0, 10)}…{txHash.slice(-6)}
              </a>
            </div>
          )}
        </div>

        {failed && (
          <p className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Bridge failed. Check oracle-node logs and Circle Iris API for the
            CCTP nonce. The campaign row remains in Supabase for retry.
          </p>
        )}
        {error && (
          <p className="text-xs text-muted-foreground">
            Status fetch error: {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
