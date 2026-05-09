"use client";

import {
  Activity,
  AlertTriangle,
  Coins,
  ExternalLink,
  Network,
  Server,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";

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
import {
  claimRewards,
  fetchOracleNode,
  registerOracle,
  unregisterOracle,
  withdrawStake,
} from "@/lib/oracle-actions";
import { explorerUrl, ORACLE_MIN_STAKE_USDC } from "@/lib/solana";
import type {
  OracleNetworkStats,
  OracleNodeRecord,
  OracleSubmissionRecord,
} from "@/lib/types";
import { useOracleProgram } from "@/lib/use-oracle-program";
import { useVistaWallet } from "@/lib/use-vista-wallet";
import { formatUsdc, truncateAddress } from "@/lib/utils";

export default function OracleDashboardPage() {
  const program = useOracleProgram();
  const { address, isConnected, openConnectModal } = useVistaWallet();

  const [endpointUrl, setEndpointUrl] = useState("");
  const [node, setNode] = useState<OracleNodeRecord | null>(null);
  const [submissions, setSubmissions] = useState<OracleSubmissionRecord[]>([]);
  const [stats, setStats] = useState<OracleNetworkStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState<
    null | "register" | "unregister" | "claim" | "withdraw"
  >(null);

  const refreshStats = useCallback(() => {
    fetchJson<OracleNetworkStats>("/api/oracle/network-stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const refreshSelf = useCallback(async () => {
    if (!address) {
      setNode(null);
      setSubmissions([]);
      return;
    }
    setLoading(true);
    try {
      const [statusRes, subsRes] = await Promise.all([
        fetchJson<{ node: OracleNodeRecord | null }>(
          `/api/oracle/status?wallet=${address}`,
        ),
        fetchJson<{ submissions: OracleSubmissionRecord[] }>(
          `/api/oracle/submissions?wallet=${address}&limit=20`,
        ),
      ]);
      setNode(statusRes.node);
      setSubmissions(subsRes.submissions);
    } catch {
      setNode(null);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => refreshStats(), [refreshStats]);
  useEffect(() => {
    void refreshSelf();
  }, [refreshSelf]);

  const isRegistered = Boolean(node && node.active);
  const canClaim = Boolean(node && node.reward_balance > 0);

  async function withSpinner<T>(
    label: typeof actionPending,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    if (!program || !address) {
      if (openConnectModal) openConnectModal();
      else toast.error("Connect a Solana wallet first.");
      return null;
    }
    setActionPending(label);
    try {
      const out = await fn();
      // Give Supabase a beat to absorb the webhook before we re-fetch.
      await new Promise((r) => setTimeout(r, 1500));
      void refreshSelf();
      void refreshStats();
      return out;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transaction failed.");
      return null;
    } finally {
      setActionPending(null);
    }
  }

  async function handleRegister() {
    if (!endpointUrl.trim()) {
      toast.error("Endpoint URL is required.");
      return;
    }
    // register_oracle uses Anchor `init` (not init_if_needed), so a second
    // call with the same wallet collides with the existing oracle_node PDA
    // and reverts with "Allocate: account already in use" / 0x0. Pre-flight
    // the account read so we surface a clean message instead of a sim error.
    try {
      const existing = await fetchOracleNode(program!, new PublicKey(address!));
      if (existing) {
        if (existing.active) {
          toast.info("Already registered as an active oracle.");
          return;
        }
        toast.error(
          "Oracle node PDA already exists but is unregistered — wait for the 7-day lockup, then call withdraw_stake before re-registering.",
        );
        return;
      }
    } catch {
      // fall through — let the actual register call surface the error if any
    }

    const sig = await withSpinner("register", async () =>
      registerOracle(program!, {
        oracle: new PublicKey(address!),
        endpointUrl: endpointUrl.trim(),
      }),
    );
    if (sig) {
      toast.success(`Registered as oracle. Tx ${truncateAddress(sig)}`);
      window.open(explorerUrl("tx", sig), "_blank", "noopener,noreferrer");
    }
  }

  async function handleUnregister() {
    const sig = await withSpinner("unregister", async () =>
      unregisterOracle(program!, new PublicKey(address!)),
    );
    if (sig) toast.success("Unregistered. Stake unlocks in 7 days.");
  }

  async function handleClaim() {
    const sig = await withSpinner("claim", async () =>
      claimRewards(program!, new PublicKey(address!)),
    );
    if (sig) toast.success("Rewards claimed.");
  }

  async function handleWithdraw() {
    const sig = await withSpinner("withdraw", async () =>
      withdrawStake(program!, new PublicKey(address!)),
    );
    if (sig) toast.success("Stake withdrawn.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oracle Network"
        title="Validator dashboard"
        description="Stake USDC, run an oracle node, verify human attention on-chain. Honest validators earn 10% of every ad dollar; outliers get slashed."
      />

      <SectionHeader
        eyebrow="Network · all validators"
        title="Oracle network overview"
        description="Aggregate state across every registered VISTA oracle — not your node alone."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active oracles (network)"
          value={stats?.activeNodes ?? 0}
          icon={Network}
          format="number"
        />
        <StatCard
          title="Total staked (network)"
          value={(stats?.totalStaked ?? 0) / 1_000_000}
          icon={Coins}
          format="usdc"
        />
        <StatCard
          title="Sessions today (network)"
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

      {!isConnected && (
        <Card className="border-dashed bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              Connect a Solana wallet
            </CardTitle>
            <CardDescription>
              The oracle dashboard runs on Solana devnet. Connect Phantom,
              Solflare, or any wallet-standard wallet to register, claim
              rewards, or unstake.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => openConnectModal?.()}>Connect wallet</Button>
          </CardContent>
        </Card>
      )}

      {isConnected && !isRegistered && (
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              Become a VISTA Oracle Node
            </CardTitle>
            <CardDescription>
              Stake {ORACLE_MIN_STAKE_USDC} USDC (devnet) and start verifying
              attention. Honest validators split 10% of every ad dollar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Minimum stake
                </p>
                <p className="mt-1 font-semibold">
                  {ORACLE_MIN_STAKE_USDC} USDC
                </p>
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

            <div className="space-y-2">
              <Label htmlFor="oracle-endpoint">
                Oracle node endpoint (public URL of your{" "}
                <code className="font-mono text-xs">/oracle-node</code> service)
              </Label>
              <Input
                id="oracle-endpoint"
                placeholder="https://oracle-1.your-host.app"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-amber-200">
                <AlertTriangle className="size-4" />
                Stake is slashed if your scores deviate from consensus.
              </p>
              <p className="mt-1 text-muted-foreground">
                You also need at least 100 USDC + ~0.01 SOL in your wallet to
                cover the stake transfer and rent for the OracleNode PDA.
              </p>
            </div>

            <Button
              size="lg"
              disabled={
                !endpointUrl.trim() || actionPending === "register" || !program
              }
              onClick={handleRegister}
            >
              {actionPending === "register"
                ? "Registering…"
                : `Stake ${ORACLE_MIN_STAKE_USDC} USDC & register`}
            </Button>
          </CardContent>
        </Card>
      )}

      {node && (
        <>
          <SectionHeader
            eyebrow="Just this validator"
            title="Your oracle node"
            description={`On-chain state for the wallet you're connected with (${truncateAddress(node.oracle_pubkey)}). Every metric below is yours alone.`}
          />

          <Card className="border-primary/30 bg-card/90 ring-1 ring-primary/15">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${node.active ? "bg-emerald-400" : "bg-muted-foreground"}`}
                  />
                  {node.active ? "Your active oracle node" : "Your inactive oracle node"}
                </CardTitle>
                <Badge variant={node.active ? "default" : "outline"}>
                  {node.active ? "Online" : "Unregistered"}
                </Badge>
              </div>
              <CardDescription className="font-mono text-xs">
                {node.oracle_pubkey}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="Your stake"
                  value={`${formatUsdc(node.stake_amount / 1_000_000)} USDC`}
                />
                <Stat
                  label="Your pending rewards"
                  value={`${formatUsdc(node.reward_balance / 1_000_000)} USDC`}
                />
                <Stat
                  label="Your sessions verified"
                  value={node.total_submissions.toString()}
                />
                <Stat
                  label="Your total slashed"
                  value={`${formatUsdc(node.total_slashes / 1_000_000)} USDC`}
                />
                <Stat
                  label="Your endpoint"
                  value={node.endpoint_url}
                  mono
                  className="sm:col-span-2"
                />
                <Stat label="Your reputation" value={node.reputation.toString()} />
                <Stat
                  label="Registered"
                  value={new Date(node.registered_at).toLocaleDateString()}
                />
              </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleClaim}
                disabled={!canClaim || actionPending === "claim"}
              >
                {actionPending === "claim"
                  ? "Claiming…"
                  : canClaim
                    ? `Claim ${formatUsdc(node.reward_balance / 1_000_000)} USDC`
                    : "No rewards yet"}
              </Button>
              {node.active ? (
                <Button
                  variant="outline"
                  onClick={handleUnregister}
                  disabled={actionPending === "unregister"}
                >
                  {actionPending === "unregister"
                    ? "Unregistering…"
                    : "Unregister (7-day lockup)"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleWithdraw}
                  disabled={actionPending === "withdraw"}
                >
                  {actionPending === "withdraw"
                    ? "Withdrawing…"
                    : "Withdraw stake"}
                </Button>
              )}
              <a
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                href={explorerUrl("address", node.oracle_pubkey)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Solana Explorer <ExternalLink className="size-3" />
              </a>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {node && submissions.length > 0 && (
        <Card className="border-primary/30 bg-card/90 ring-1 ring-primary/15">
          <CardHeader>
            <CardTitle>Your recent submissions</CardTitle>
            <CardDescription>
              Last {submissions.length} verification{submissions.length === 1 ? "" : "s"} submitted by your oracle wallet
              ({truncateAddress(address ?? "")}).
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

      {isConnected && !isRegistered && !loading && (
        <p className="text-xs text-muted-foreground">
          Wallet {truncateAddress(address ?? "")} not yet registered.
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3">
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-primary/80">
        {eyebrow}
      </span>
      <h2 className="text-base font-semibold leading-tight">{title}</h2>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
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
