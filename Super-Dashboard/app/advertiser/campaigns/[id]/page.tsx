"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Coins, Eye, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { LoadingScreen } from "@/components/loading-screen";
import { MetricChartCard } from "@/components/metric-chart-card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";
import {
  contractAddresses,
  hasContractConfig,
  vistaEscrowAbi,
} from "@/lib/contracts";
import type { CampaignDetailData } from "@/lib/types";
import {
  formatDateTime,
  buildExplorerUrl,
  formatUsdc,
  truncateAddress,
  truncateHash,
} from "@/lib/utils";
import { baseSepoliaNetwork, wagmiConfig } from "@/lib/wagmi";

function AudienceBreakdown({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  emptyText: string;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize">{item.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [data, setData] = useState<CampaignDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    if (!params?.id) return;

    let cancelled = false;

    async function load() {
      const result = await fetchJson<CampaignDetailData>(
        `/api/campaigns/${params.id}`,
      );
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  async function handleRefund() {
    if (!data) return;

    try {
      setIsRefunding(true);

      let txHash: `0x${string}` | null = null;

      if (hasContractConfig && contractAddresses.vistaEscrow) {
        if (chainId !== baseSepoliaNetwork.id) {
          await switchChainAsync({ chainId: baseSepoliaNetwork.id });
        }

        txHash = await writeContractAsync({
          abi: vistaEscrowAbi,
          address: contractAddresses.vistaEscrow,
          functionName: "refundRemaining",
          args: [data.campaign.campaign_id_onchain as `0x${string}`],
          chainId: baseSepoliaNetwork.id,
        });

        await waitForTransactionReceipt(wagmiConfig, { hash: txHash });
      } else {
        toast.warning(
          "Contract config missing, refund is running in demo mode only.",
        );
      }

      await fetchJson(`/api/campaigns/${data.campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      toast.success("Campaign ended and marked for refund.");
      router.refresh();
      setData((current) =>
        current
          ? {
              ...current,
              campaign: { ...current.campaign, active: false },
            }
          : current,
      );

      if (txHash) {
        window.open(
          buildExplorerUrl("tx", txHash),
          "_blank",
          "noopener,noreferrer",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to process refund.",
      );
    } finally {
      setIsRefunding(false);
    }
  }

  if (loading || !data) {
    return (
      <LoadingScreen description="Loading campaign analytics, viewer trends, and session detail." />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              className={buttonVariants({ size: "lg", variant: "outline" })}
              href={data.campaign.target_url}
              target="_blank"
            >
              Open target URL
            </Link>
            <Button
              disabled={isRefunding || !data.campaign.active}
              onClick={handleRefund}
              size="lg"
              variant="destructive"
            >
              {isRefunding ? "Ending..." : "End Campaign & Refund"}
            </Button>
          </div>
        }
        eyebrow="Campaign detail"
        title={data.campaign.title}
        description="Drill into verified sessions, live budget state, and daily viewer performance."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          title="Total viewers"
          value={data.stats.totalViewers}
        />
        <StatCard
          icon={Timer}
          title="Total seconds"
          value={data.stats.totalSecondsVerified}
        />
        <StatCard
          icon={Coins}
          title="Total USDC spent"
          value={data.stats.totalUsdcSpent}
          format="usdc"
        />
        <StatCard
          icon={Eye}
          title="Remaining budget"
          value={data.stats.remainingBudget}
          format="usdc"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <MetricChartCard
          data={data.viewersPerDay}
          description="Verified viewers by day, with spend trend layered in."
          primaryLabel="Viewers"
          secondaryLabel="USDC spent"
          title="Viewers per day"
          valueFormatter={(value) => value.toFixed(2)}
        />

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="overflow-hidden rounded-[24px] border border-border/70">
              <Image
                alt={data.campaign.title}
                className="aspect-[16/9] w-full object-cover"
                height={720}
                src={data.campaign.creative_url}
                width={1280}
              />
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={data.campaign.active ? "default" : "outline"}>
                  {data.campaign.active ? "Active" : "Ended"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Campaign ID</span>
                <span className="font-medium">
                  {truncateHash(data.campaign.campaign_id_onchain)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Rate per second</span>
                <span className="font-medium">
                  {formatUsdc(data.campaign.rate_per_second)} USDC
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Audience filters</span>
                <div className="flex max-w-[280px] flex-wrap justify-end gap-2">
                  {(data.campaign.target_preferences ?? []).map(
                    (preference) => (
                      <Badge key={preference} variant="outline">
                        {preference}
                      </Badge>
                    ),
                  )}
                  {(data.campaign.target_locations ?? []).map((location) => (
                    <Badge key={location} variant="outline">
                      {location}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">
            Audience Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Demographic breakdown of verified viewers for this campaign.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <AudienceBreakdown
            title="Top Preferences"
            items={data.audienceAnalytics.preferenceBreakdown
              .slice(0, 8)
              .map((item) => ({
                label: item.preference,
                count: item.count,
              }))}
            emptyText="No preference data yet."
          />
          <AudienceBreakdown
            title="Age Distribution"
            items={data.audienceAnalytics.ageBreakdown.map((item) => ({
              label: item.range,
              count: item.count,
            }))}
            emptyText="No age data yet."
          />
          <AudienceBreakdown
            title="Top Locations"
            items={data.audienceAnalytics.locationBreakdown
              .slice(0, 8)
              .map((item) => ({
                label: item.location,
                count: item.count,
              }))}
            emptyText="No location data yet."
          />
        </div>
      </div>

      <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Every verified session linked to this campaign.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>User wallet</TableHead>
              <TableHead>Seconds verified</TableHead>
              <TableHead>USDC paid</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {truncateHash(session.sessionIdOnchain)}
                </TableCell>
                <TableCell>{truncateAddress(session.userWallet)}</TableCell>
                <TableCell>{session.secondsVerified}</TableCell>
                <TableCell>{formatUsdc(session.usdcPaid)}</TableCell>
                <TableCell>{formatDateTime(session.startedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
