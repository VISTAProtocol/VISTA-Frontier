"use client";

import {
  Activity,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Code2,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  Key,
  LayoutGrid,
  MonitorPlay,
  Plus,
  Radar,
  Server,
  Sparkles,
  TimerReset,
  TrendingUp,
  Wallet,
  Wallet2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

import { LoadingScreen } from "@/components/loading-screen";
import { MetricChartCard } from "@/components/metric-chart-card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";
import { USDC_DECIMALS } from "@/lib/solana";
import type {
  PublisherAnalyticsData,
  PublisherDashboardData,
  PublisherRecord,
} from "@/lib/types";
import { useVistaProgram } from "@/lib/use-vista-program";
import { bridgeWithdraw, fetchBridgeBalance } from "@/lib/bridge-actions";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useVistaWallet } from "@/lib/use-vista-wallet";
import { fetchUserBalance, withdraw } from "@/lib/vista-actions";
import { formatUsdc, truncateAddress, truncateHash } from "@/lib/utils";

// ─── Platform Card ─────────────────────────────────────────────────────────

function PlatformCard({
  publisher,
  onSelect,
}: {
  publisher: PublisherRecord;
  onSelect: () => void;
}) {
  const formattedDate = new Date(publisher.created_at).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <button
      onClick={onSelect}
      className="group w-full text-left rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <MonitorPlay className="size-5 text-primary" />
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          Active
        </Badge>
      </div>

      <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">
        {publisher.platform_name}
      </h3>
      <p className="text-xs text-muted-foreground font-mono truncate mb-3">
        {publisher.api_key}
      </p>
      <p className="text-xs text-muted-foreground">Registered {formattedDate}</p>

      <div className="mt-4 flex items-center gap-1.5 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        View details
        <ExternalLink className="size-3" />
      </div>
    </button>
  );
}

// ─── Platform Detail Panel ──────────────────────────────────────────────────

function PlatformDetailPanel({
  publisher,
  address,
  onBack,
}: {
  publisher: PublisherRecord;
  address: string;
  onBack: () => void;
}) {
  const [detailTab, setDetailTab] = useState<"integration" | "apikey">(
    "integration",
  );

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
  }

  const envSnippet = `# .env (server-side, never expose to client)
VISTA_API_KEY=${publisher.api_key}
NEXT_PUBLIC_VISTA_ORACLE_URL=http://your-oracle-url:3300
NEXT_PUBLIC_VISTA_PUBLISHER_WALLET=${address}`;

  const initSnippet = `import { VistaSDK } from '@vista-protocol/sdk';

// Initialize with your publisher credentials
const vista = new VistaSDK({
  publisherWallet: '${address}',
  oracleUrl: process.env.NEXT_PUBLIC_VISTA_ORACLE_URL,
});`;

  const trackSnippet = `// When an ad becomes visible
vista.attachZone('your-ad-zone-element-id', {
  campaignId: campaign.campaign_id_onchain,
  userWallet: user.address,
});

// When the ad is no longer visible
vista.detachZone('your-ad-zone-element-id');`;

  const integrationSteps = [
    {
      number: "01",
      title: "Install the SDK",
      desc: "Add the Vista Protocol SDK to your project.",
      code: "npm install @vista-protocol/sdk",
      lang: "bash",
    },
    {
      number: "02",
      title: "Configure environment",
      desc: "Set your credentials as server-side environment variables.",
      code: envSnippet,
      lang: "bash",
    },
    {
      number: "03",
      title: "Initialize the SDK",
      desc: "Bootstrap Vista at the app root level.",
      code: initSnippet,
      lang: "ts",
    },
    {
      number: "04",
      title: "Track ad zones",
      desc: "Attach and detach zones as ads enter and leave the viewport.",
      code: trackSnippet,
      lang: "ts",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          ← All Platforms
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{publisher.platform_name}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <MonitorPlay className="size-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{publisher.platform_name}</h2>
            <p className="text-sm text-muted-foreground">
              Registered{" "}
              {new Date(publisher.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
        <Badge className="self-start sm:self-auto px-3 py-1">Active</Badge>
      </div>

      <div className="flex border-b border-border/50 overflow-x-auto">
        <button
          onClick={() => setDetailTab("integration")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
            detailTab === "integration"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code2 className="size-4" />
          Integration Guide
        </button>
        <button
          onClick={() => setDetailTab("apikey")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
            detailTab === "apikey"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Key className="size-4" />
          API Key
        </button>
      </div>

      {detailTab === "apikey" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <Card className="border-amber-500/20 bg-amber-50/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                <Key className="size-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Secret Key
                </span>
              </div>
              <CardTitle className="text-lg">Your API Key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <code className="text-sm font-mono break-all text-foreground">
                  {publisher.api_key}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copy(publisher.api_key)}
                >
                  <Copy className="size-3.5 mr-1.5" />
                  Copy
                </Button>
              </div>
              <div className="space-y-2.5 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <Server className="size-4 text-muted-foreground" /> Security
                  Best Practices
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  {[
                    "Store this key in server-side environment variables only.",
                    "Never embed this key in client-side JavaScript bundles.",
                    "Rotate this key immediately if you suspect a leak.",
                    "Use it to sign payloads sent to the Vista Oracle.",
                  ].map((tip, i) => (
                    <li key={i} className="flex gap-2.5">
                      <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {detailTab === "integration" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-blue-500" />
            <p className="text-sm text-muted-foreground">
              Follow these 4 steps to integrate Vista into{" "}
              <span className="font-medium text-foreground">
                {publisher.platform_name}
              </span>
              .
            </p>
          </div>

          <div className="space-y-4">
            {integrationSteps.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-border/60 bg-card overflow-hidden"
              >
                <div className="flex items-center gap-4 px-5 py-4 border-b border-border/40 bg-muted/20">
                  <span className="text-2xl font-bold text-muted-foreground/30 font-mono tabular-nums">
                    {step.number}
                  </span>
                  <div>
                    <p className="font-semibold text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
                <div className="relative">
                  <pre className="overflow-x-auto p-5 text-xs leading-6 font-mono text-foreground bg-muted/10">
                    {step.code}
                  </pre>
                  <button
                    onClick={() => copy(step.code)}
                    className="absolute top-3 right-3 size-7 flex items-center justify-center rounded-md border border-border/60 bg-background/80 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Copy snippet"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analytics Tab ──────────────────────────────────────────────────────────

interface AnalyticsTabProps {
  dashboard: PublisherDashboardData;
  totalWithdrawn: number;
  vaultBalanceRaw: bigint;
  isWithdrawing: boolean;
  lastWithdrawTx: string | null;
  withdrawError: string | null;
  hasVaultBalance: boolean;
  handleWithdraw: () => void;
  canWithdraw: boolean;
  address: string;
}

function AnalyticsTab({
  dashboard,
  totalWithdrawn,
  vaultBalanceRaw,
  isWithdrawing,
  lastWithdrawTx,
  withdrawError,
  hasVaultBalance,
  handleWithdraw,
  canWithdraw,
  address,
}: AnalyticsTabProps) {
  const [analyticsData, setAnalyticsData] =
    useState<PublisherAnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  useEffect(() => {
    if (!address) return;
    setIsLoadingAnalytics(true);
    fetchJson<PublisherAnalyticsData>(`/api/publishers/${address}/analytics`)
      .then(setAnalyticsData)
      .catch(() => {})
      .finally(() => setIsLoadingAnalytics(false));
  }, [address]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Coins}
          title="Total USDC Withdrawn"
          value={formatUsdc(totalWithdrawn)}
          format="usdc"
        />
        <StatCard
          icon={Eye}
          title="Total ad impressions"
          value={dashboard.stats.totalAdImpressions}
        />
        <StatCard
          icon={TimerReset}
          title="Total viewer-seconds"
          value={dashboard.stats.totalViewerSeconds}
        />
        <StatCard
          icon={Activity}
          title="Active sessions now"
          value={dashboard.stats.activeSessions}
        />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4">
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
              </div>
              <p className="text-sm text-muted-foreground">
                Accumulated revenue share from ad sessions — withdraw any time.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={handleWithdraw}
                disabled={!hasVaultBalance || isWithdrawing || !canWithdraw}
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

      <MetricChartCard
        data={dashboard.revenuePerDay}
        description="Daily publisher revenue from on-chain stream tick records."
        title="Revenue per day"
        valueFormatter={(value: number) => `${formatUsdc(value)} USDC`}
      />

      {isLoadingAnalytics ? (
        <div className="h-40 rounded-2xl border border-border/40 bg-muted/20 animate-pulse" />
      ) : analyticsData ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              icon={Wallet2}
              title="Campaigns tracked"
              value={analyticsData.breakdownByCampaign.length}
            />
            <StatCard
              icon={Clock3}
              title="Avg session duration"
              value={analyticsData.averageSessionDuration}
            />
            <StatCard
              icon={Radar}
              title="Top time slots"
              value={analyticsData.topTimeSlots.length}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <MetricChartCard
              data={analyticsData.topTimeSlots.map((slot) => ({
                date: String(slot.hour),
                label: slot.label,
                value: slot.revenue,
              }))}
              description="Highest revenue windows based on stream_ticks grouped by hour."
              kind="bar"
              title="Top performing time slots"
              valueFormatter={(value: number) => `${formatUsdc(value)} USDC`}
            />

            <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight">
                  Revenue by campaign
                </h2>
                <p className="text-sm text-muted-foreground">
                  Campaign-level earnings attributed to this publisher.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Impressions</TableHead>
                    <TableHead>Viewer-s</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticsData.breakdownByCampaign.map((campaign) => (
                    <TableRow key={campaign.campaignIdOnchain}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">
                            {campaign.campaignTitle}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {campaign.campaignIdOnchain.slice(0, 10)}…
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{formatUsdc(campaign.revenue)}</TableCell>
                      <TableCell>{campaign.impressions}</TableCell>
                      <TableCell>{campaign.viewerSeconds}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}

      <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Recent sessions
          </h2>
          <p className="text-sm text-muted-foreground">
            Latest sessions attributed to this publisher wallet.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>User wallet</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Earned</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.recentSessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {truncateHash(session.sessionIdOnchain)}
                </TableCell>
                <TableCell>{truncateAddress(session.userWallet)}</TableCell>
                <TableCell>{session.secondsVerified}s</TableCell>
                <TableCell>{formatUsdc(session.publisherAmount ?? 0)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      session.status === "active" ? "default" : "outline"
                    }
                  >
                    {session.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PublisherDashboardPage() {
  const { address } = useVistaWallet();
  const program = useVistaProgram();
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">(
    "dashboard",
  );
  const [publishers, setPublishers] = useState<PublisherRecord[]>([]);
  const [isLoadingPublishers, setIsLoadingPublishers] = useState(true);
  const [selectedPublisher, setSelectedPublisher] =
    useState<PublisherRecord | null>(null);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);

  const [dashboard, setDashboard] = useState<PublisherDashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  const [vaultBalanceRaw, setVaultBalanceRaw] = useState<bigint>(BigInt(0));
  const [bridgeBalanceRaw, setBridgeBalanceRaw] = useState<bigint>(BigInt(0));
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [lastWithdrawTx, setLastWithdrawTx] = useState<string | null>(null);
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  // Fetch platforms
  useEffect(() => {
    if (!address) return;
    setIsLoadingPublishers(true);
    fetch(`/api/publishers?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => setPublishers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoadingPublishers(false));
  }, [address]);

  // Fetch on-chain dashboard rollup (Supabase-derived).
  useEffect(() => {
    if (!address) return;
    setIsLoadingDashboard(true);
    fetchJson<PublisherDashboardData>(`/api/dashboard/publisher?wallet=${address}`)
      .then(setDashboard)
      .catch(() => setDashboard(null))
      .finally(() => setIsLoadingDashboard(false));
  }, [address]);

  const fetchTotalWithdrawn = useCallback(async () => {
    if (!address) return;
    const res = await fetch(`/api/publisher/withdrawal?wallet=${address}`);
    if (res.ok) {
      const data = (await res.json()) as { totalWithdrawn: number };
      setTotalWithdrawn(data.totalWithdrawn ?? 0);
    }
  }, [address]);

  useEffect(() => {
    void fetchTotalWithdrawn();
  }, [fetchTotalWithdrawn]);

  const refreshBalance = useCallback(async () => {
    if (!program || !address) return;
    try {
      const bn = await fetchUserBalance(program, new PublicKey(address));
      setVaultBalanceRaw(bn ? BigInt(bn.toString()) : BigInt(0));
    } catch (err) {
      console.warn("[publisher-dashboard] fetchUserBalance failed:", err);
    }
    try {
      const raw = await fetchBridgeBalance(connection, new PublicKey(address));
      setBridgeBalanceRaw(raw);
    } catch (err) {
      console.warn("[publisher-dashboard] fetchBridgeBalance failed:", err);
    }
  }, [program, address, connection]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const handleWithdraw = useCallback(async () => {
    if (!program || !address) return;
    setWithdrawError(null);
    setLastWithdrawTx(null);
    setIsWithdrawing(true);

    const amountAtoms = vaultBalanceRaw + bridgeBalanceRaw;

    try {
      // Withdraw both escrows in sequence; skip whichever has zero balance to
      // avoid the on-chain `NothingToWithdraw` revert.
      let sig: string | null = null;
      if (vaultBalanceRaw > BigInt(0)) {
        sig = await withdraw(program, new PublicKey(address));
      }
      if (bridgeBalanceRaw > BigInt(0) && anchorWallet) {
        sig = await bridgeWithdraw(connection, anchorWallet);
      }
      if (!sig) throw new Error("No balance to withdraw.");
      setLastWithdrawTx(sig);

      try {
        await fetch("/api/publisher/withdrawal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            amount: Number(amountAtoms) / 10 ** USDC_DECIMALS,
            withdrawnAt: new Date().toISOString(),
          }),
        });
        await fetchTotalWithdrawn();
      } catch (err) {
        console.warn("[publisher-dashboard] record-withdrawal failed:", err);
      }

      toast.success("Withdrawal confirmed.");
      await refreshBalance();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setWithdrawError(message);
      toast.error(`Withdraw failed: ${message.split("\n")[0]}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [program, address, vaultBalanceRaw, bridgeBalanceRaw, anchorWallet, connection, fetchTotalWithdrawn, refreshBalance]);

  const totalBalanceRaw = useMemo(
    () => vaultBalanceRaw + bridgeBalanceRaw,
    [vaultBalanceRaw, bridgeBalanceRaw],
  );

  const hasVaultBalance = useMemo(
    () => totalBalanceRaw > BigInt(0),
    [totalBalanceRaw],
  );

  if (isLoadingDashboard || !dashboard) {
    return (
      <LoadingScreen description="Loading publisher revenue, active sessions, and daily trend lines." />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Publisher dashboard"
        title="Monetization Performance"
        description="Manage your registered platforms, track impressions, and withdraw USDC revenue."
      />

      <div className="flex border-b border-border/50 overflow-x-auto">
        <button
          onClick={() => { setActiveTab("dashboard"); setSelectedPublisher(null); }}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${
            activeTab === "dashboard"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="size-4" />
          Dashboard
        </button>
        <button
          onClick={() => { setActiveTab("analytics"); setSelectedPublisher(null); }}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${
            activeTab === "analytics"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="size-4" />
          Analytics
        </button>
      </div>

      {activeTab === "dashboard" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {selectedPublisher ? (
            <PlatformDetailPanel
              publisher={selectedPublisher}
              address={address ?? ""}
              onBack={() => setSelectedPublisher(null)}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Your Platforms</h2>
                  <p className="text-sm text-muted-foreground">
                    Click a platform to view its integration guide and API key.
                  </p>
                </div>
                <Link
                  href="/publisher/onboarding"
                  className={buttonVariants({ size: "sm" })}
                >
                  <Plus className="size-4 mr-1.5" />
                  Register new platform
                </Link>
              </div>

              {isLoadingPublishers ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-44 rounded-2xl border border-border/40 bg-muted/20 animate-pulse"
                    />
                  ))}
                </div>
              ) : publishers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-16 text-center">
                  <MonitorPlay className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium mb-1">No platforms registered yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Register your first platform to get an API key and start
                    earning.
                  </p>
                  <Link
                    href="/publisher/onboarding"
                    className={buttonVariants({ size: "sm" })}
                  >
                    <Plus className="size-4 mr-1.5" />
                    Register a platform
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {publishers.map((pub) => (
                    <PlatformCard
                      key={pub.id}
                      publisher={pub}
                      onSelect={() => setSelectedPublisher(pub)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "analytics" && address && (
        <AnalyticsTab
          dashboard={dashboard}
          totalWithdrawn={totalWithdrawn}
          vaultBalanceRaw={totalBalanceRaw}
          isWithdrawing={isWithdrawing}
          lastWithdrawTx={lastWithdrawTx}
          withdrawError={withdrawError}
          hasVaultBalance={hasVaultBalance}
          handleWithdraw={handleWithdraw}
          canWithdraw={Boolean(program)}
          address={address}
        />
      )}
    </div>
  );
}
