"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { Layers, Link2, Loader2, ShieldCheck, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import bs58 from "bs58";
import {
  useAccount,
  useChainId,
  useSignMessage,
  useSwitchChain,
} from "wagmi";

import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EVM_CHAINS, type SupportedEvmChainKey } from "@/lib/evm/chains";
import { fetchJson } from "@/lib/http";
// `import type` keeps the server-only supabase code in `lib/identity.ts`
// out of the client bundle.
import type { AggregatedAttention, LinkedWallet } from "@/lib/identity";
import { useVistaWallet } from "@/lib/use-vista-wallet";

const JWT_KEY = "vista.jwt";

function jwtKeyFor(wallet: string) {
  return `${JWT_KEY}:${wallet}`;
}

function truncate(addr: string, head = 6, tail = 4) {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function chainLabel(chain: string) {
  if (chain === "solana-devnet") return "Solana Devnet";
  return EVM_CHAINS[chain as SupportedEvmChainKey]?.label ?? chain;
}

export default function IdentityPage() {
  const { address: primary } = useVistaWallet();
  const { signMessage: solanaSignMessage } = useWallet();
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const evmChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [chain, setChain] =
    useState<SupportedEvmChainKey>("base-sepolia");
  const [links, setLinks] = useState<LinkedWallet[]>([]);
  const [aggregated, setAggregated] = useState<AggregatedAttention | null>(
    null,
  );
  const [linking, setLinking] = useState(false);

  // Restore JWT for the currently-connected primary wallet (per-wallet key
  // so switching wallets does not leak a stale token).
  useEffect(() => {
    if (!primary || typeof window === "undefined") {
      setToken(null);
      return;
    }
    setToken(window.localStorage.getItem(jwtKeyFor(primary)));
  }, [primary]);

  const authedFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!token) throw new Error("Not signed in.");
      return fetchJson<T>(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [linksRes, attRes] = await Promise.all([
        authedFetch<{ links: LinkedWallet[] }>("/api/identity/links"),
        authedFetch<AggregatedAttention>("/api/identity/attention"),
      ]);
      setLinks(linksRes.links);
      setAggregated(attRes);
    } catch (err) {
      // 401 most often — token expired. Clear and prompt re-sign.
      if (err instanceof Error && /401|token/i.test(err.message)) {
        if (primary && typeof window !== "undefined") {
          window.localStorage.removeItem(jwtKeyFor(primary));
        }
        setToken(null);
      }
      console.warn("[identity] refresh failed:", err);
    }
  }, [authedFetch, token, primary]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSignIn() {
    if (!primary) {
      toast.error("Connect your Solana wallet first.");
      return;
    }
    if (!solanaSignMessage) {
      toast.error("This wallet does not support message signing.");
      return;
    }
    setSigningIn(true);
    try {
      const { message } = await fetchJson<{ message: string; nonce: string }>(
        `/api/auth/challenge?address=${primary}`,
      );
      const sig = await solanaSignMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(sig);
      const verified = await fetchJson<{
        token: string;
        walletAddress: string;
      }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ address: primary, message, signature }),
      });
      window.localStorage.setItem(jwtKeyFor(primary), verified.token);
      setToken(verified.token);
      toast.success("Signed in.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Sign-in failed.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleLink() {
    if (!evmConnected || !evmAddress) {
      toast.error("Connect an EVM wallet first.");
      return;
    }
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    setLinking(true);
    try {
      const targetChainId = EVM_CHAINS[chain].chain.id;
      if (evmChainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      const { message } = await authedFetch<{
        message: string;
        nonce: string;
      }>("/api/identity/link/challenge", {
        method: "POST",
        body: JSON.stringify({
          secondaryWallet: evmAddress,
          secondaryChain: chain,
        }),
      });

      const signature = await signMessageAsync({ message });

      await authedFetch("/api/identity/link/verify", {
        method: "POST",
        body: JSON.stringify({
          secondaryWallet: evmAddress,
          secondaryChain: chain,
          message,
          signature,
        }),
      });

      toast.success(`Linked ${truncate(evmAddress)} on ${chainLabel(chain)}.`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link failed.");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(id: string) {
    try {
      await authedFetch(`/api/identity/links/${id}`, { method: "DELETE" });
      toast.success("Wallet unlinked.");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlink failed.");
    }
  }

  if (!primary) {
    return (
      <LoadingScreen description="Connect your Solana wallet to manage cross-chain identity." />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cross-platform identity"
        title="One identity, many chains"
        description="Link EVM wallets to your Solana primary identity. Attention scored across all linked wallets, weighted by source reputation."
      />

      {!token ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Sign in required
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign a one-time message with your Solana wallet to authorize
                identity changes.
              </p>
            </div>
            <Button onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? (
                <>
                  <Loader2 className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <ShieldCheck />
                  Sign in with Solana
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Primary identity
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="default">Solana</Badge>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">
              {primary}
            </code>
            <Badge variant="outline">weight 1.00</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Link an EVM wallet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a chain, connect (or switch) the EVM wallet, then sign the
                challenge.
              </p>
            </div>
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={chain}
              onChange={(e) =>
                setChain(e.target.value as SupportedEvmChainKey)
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={linking}
            >
              {Object.values(EVM_CHAINS).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <Button
              onClick={handleLink}
              disabled={!token || !evmConnected || linking}
            >
              {linking ? (
                <>
                  <Loader2 className="animate-spin" />
                  Linking…
                </>
              ) : (
                <>
                  <Link2 />
                  Link wallet
                </>
              )}
            </Button>

            {evmConnected && evmAddress ? (
              <span className="text-xs text-muted-foreground">
                EVM connected: <code>{truncate(evmAddress)}</code>
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Linked wallets
            </p>
            <Badge variant="outline">{links.length}</Badge>
          </div>

          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No EVM wallets linked yet. Link one above to start aggregating
              attention across chains.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Linked</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <code className="font-mono text-xs">
                        {truncate(link.secondary_wallet)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {chainLabel(link.secondary_chain)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {Number(link.reputation_weight).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(link.linked_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnlink(link.id)}
                      >
                        <Unlink />
                        Unlink
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Aggregated attention
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {aggregated
                  ? `${(aggregated.aggregatedScore * 100).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Weighted sum across all sources, clamped to 100%.
              </p>
            </div>
            <Layers className="size-10 text-muted-foreground" />
          </div>

          {aggregated && aggregated.sources.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Raw</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead className="text-right">Sec verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.sources.map((s) => (
                  <TableRow key={`${s.wallet}-${s.chain}`}>
                    <TableCell>
                      <code className="font-mono text-xs">
                        {truncate(s.wallet)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{chainLabel(s.chain)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.role === "primary" ? "default" : "outline"}
                      >
                        {s.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(s.rawScore * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.weight.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {(s.weightedScore * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.totalSecondsVerified}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {token
                ? "No attention recorded yet for this identity."
                : "Sign in to view your aggregated attention."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
