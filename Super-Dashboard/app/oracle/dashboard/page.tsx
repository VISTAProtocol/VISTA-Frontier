"use client";

import {
  Activity,
  AlertTriangle,
  Coins,
  Network,
  Server,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";
import type {
  OracleNetworkStats,
  OracleNodeRecord,
  OracleSubmissionRecord,
} from "@/lib/types";
import { formatUsdc, truncateAddress } from "@/lib/utils";

const MIN_STAKE_USDC = 100;

export default function OracleDashboardPage() {
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [activePubkey, setActivePubkey] = useState<string | null>(null);
  const [node, setNode] = useState<OracleNodeRecord | null>(null);
  const [submissions, setSubmissions] = useState<OracleSubmissionRecord[]>([]);
  const [stats, setStats] = useState<OracleNetworkStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJson<OracleNetworkStats>("/api/oracle/network-stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (!activePubkey) return;
    setLoading(true);
    Promise.all([
      fetchJson<{ node: OracleNodeRecord | null }>(
        `/api/oracle/status?wallet=${activePubkey}`,
      )
        .then((r) => r.node)
        .catch(() => null),
      fetchJson<{ submissions: OracleSubmissionRecord[] }>(
        `/api/oracle/submissions?wallet=${activePubkey}&limit=20`,
      )
        .then((r) => r.submissions)
        .catch(() => [] as OracleSubmissionRecord[]),
    ])
      .then(([n, s]) => {
        setNode(n);
        setSubmissions(s);
      })
      .finally(() => setLoading(false));
  }, [activePubkey]);

  const isRegistered = node && node.active;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oracle Network"
        title="Validator dashboard"
        description="Stake USDC, run an oracle node, verify human attention on-chain. Honest validators earn 10% of every ad dollar; outliers get slashed."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active oracles"
          value={stats?.activeNodes ?? 0}
          icon={Network}
          format="number"
        />
        <StatCard
          title="Total staked"
          value={(stats?.totalStaked ?? 0) / 1_000_000}
          icon={Coins}
          format="usdc"
        />
        <StatCard
          title="Sessions today"
          value={stats?.sessionsToday ?? 0}
          icon={Activity}
          format="number"
        />
        <StatCard
          title="Network accuracy"
          value={`${(stats?.networkAccuracyPercent ?? 0).toFixed(1)}%`}
          icon={TrendingUp}
        />
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            View oracle status
          </CardTitle>
          <CardDescription>
            Paste a Solana pubkey to view that node&apos;s registration, stake,
            reward balance, and recent submissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setActivePubkey(pubkeyInput.trim() || null);
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="oracle-pubkey">Oracle pubkey (base58)</Label>
              <Input
                id="oracle-pubkey"
                placeholder="Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn"
                value={pubkeyInput}
                onChange={(e) => setPubkeyInput(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button type="submit" disabled={!pubkeyInput.trim()}>
              {loading ? "Loading…" : "Look up"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {activePubkey && !node && !loading && (
        <Card className="border-dashed bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              Become a VISTA Oracle Node
            </CardTitle>
            <CardDescription>
              This pubkey is not registered yet. Register on-chain by staking
              at least {MIN_STAKE_USDC} USDC (devnet).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Minimum stake
                </p>
                <p className="mt-1 font-semibold">{MIN_STAKE_USDC} USDC</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Estimated APY
                </p>
                <p className="mt-1 font-semibold">~12–18% USDC</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Slash on outlier
                </p>
                <p className="mt-1 font-semibold">10% of stake</p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-amber-200">
                <AlertTriangle className="size-4" />
                Stake is slashed if your scores deviate from consensus.
              </p>
              <p className="mt-1 text-muted-foreground">
                Run the <code className="font-mono">oracle-node</code> service
                (see <code className="font-mono">/oracle-node/README.md</code>)
                and call <code className="font-mono">register_oracle</code>{" "}
                from your Solana wallet. The dashboard reflects your status as
                soon as the on-chain tx confirms and the webhook syncs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {node && (
        <Card className="bg-card/90">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${node.active ? "bg-emerald-400" : "bg-muted-foreground"}`}
                />
                {node.active ? "Active oracle node" : "Inactive oracle node"}
              </CardTitle>
              <Badge variant={node.active ? "default" : "outline"}>
                {node.active ? "Online" : "Unregistered"}
              </Badge>
            </div>
            <CardDescription className="font-mono text-xs">
              {node.oracle_pubkey}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Stake" value={`${formatUsdc(node.stake_amount / 1_000_000)} USDC`} />
            <Stat label="Reward balance" value={`${formatUsdc(node.reward_balance / 1_000_000)} USDC`} />
            <Stat label="Sessions verified" value={node.total_submissions.toString()} />
            <Stat label="Total slashed" value={`${formatUsdc(node.total_slashes / 1_000_000)} USDC`} />
            <Stat
              label="Endpoint"
              value={node.endpoint_url}
              mono
              className="sm:col-span-2"
            />
            <Stat label="Reputation" value={node.reputation.toString()} />
            <Stat
              label="Registered"
              value={new Date(node.registered_at).toLocaleDateString()}
            />
          </CardContent>
        </Card>
      )}

      {node && submissions.length > 0 && (
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Recent submissions</CardTitle>
            <CardDescription>
              Last {submissions.length} verifications submitted by this oracle.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Consensus</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {truncateAddress(s.session_id_onchain)}
                    </TableCell>
                    <TableCell>{s.score}</TableCell>
                    <TableCell>{s.consensus_score ?? "—"}</TableCell>
                    <TableCell>
                      {s.was_outlier ? (
                        <Badge variant="destructive">Slashed</Badge>
                      ) : s.is_settled ? (
                        <Badge variant="default">Honest</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatUsdc(s.earned_amount / 1_000_000)} USDC
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.submitted_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/70 bg-muted/30 p-3 ${className ?? ""}`}
    >
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 truncate font-semibold ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
