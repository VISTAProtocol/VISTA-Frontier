"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useChainId } from "wagmi";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVM_CHAINS, type SupportedEvmChainKey } from "@/lib/evm/chains";
import { fetchJson } from "@/lib/http";
import { useEvmAuth } from "@/lib/use-evm-auth";
import { useVistaWallet } from "@/lib/use-vista-wallet";
import { cn } from "@/lib/utils";

type Identity =
  | { kind: "solana"; address: string }
  | { kind: "evm"; address: `0x${string}`; token: string | null };

const EVM_CHAIN_ORDER: SupportedEvmChainKey[] = [
  "base-sepolia",
  "arbitrum-sepolia",
  "optimism-sepolia",
  "polygon-amoy",
  "monad-testnet",
];

export default function AdvertiserOnboardingPage() {
  const { address: solanaAddress } = useVistaWallet();
  const evm = useEvmAuth();
  const currentChainId = useChainId();

  const activeChainMeta = useMemo(() => {
    const key = EVM_CHAIN_ORDER.find(
      (k) => EVM_CHAINS[k].chain.id === currentChainId,
    );
    return key ? EVM_CHAINS[key] : null;
  }, [currentChainId]);

  const [companyName, setCompanyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Default to whichever identity is present. Solana takes precedence only
  // if the user explicitly connected Phantom; EVM advertisers can ignore
  // the Solana side entirely.
  const [preferred, setPreferred] = useState<"solana" | "evm" | null>(null);

  const identity: Identity | null = useMemo(() => {
    const choice =
      preferred ?? (solanaAddress ? "solana" : evm.address ? "evm" : null);
    if (choice === "solana" && solanaAddress) {
      return { kind: "solana", address: solanaAddress };
    }
    if (choice === "evm" && evm.address) {
      return { kind: "evm", address: evm.address, token: evm.token };
    }
    return null;
  }, [preferred, solanaAddress, evm.address, evm.token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity) return;

    // EVM advertisers must sign in (SIWE) before we can record them — the
    // backend will accept the EVM JWT as proof-of-ownership.
    let evmToken = identity.kind === "evm" ? identity.token : null;
    if (identity.kind === "evm" && !evmToken) {
      evmToken = await evm.signIn();
      if (!evmToken) {
        toast.error("Sign-in required to register an EVM advertiser.");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      // Persist with the address as `walletAddress`. For EVM, downstream
      // queries will auto-detect the 0x prefix and route to
      // `advertiser_evm_address` instead.
      await fetchJson("/api/advertisers", {
        method: "POST",
        headers: evmToken ? { Authorization: `Bearer ${evmToken}` } : undefined,
        body: JSON.stringify({
          walletAddress:
            identity.kind === "evm"
              ? identity.address.toLowerCase()
              : identity.address,
          companyName,
        }),
      });
      toast.success("Advertiser profile created.");
      window.location.href = "/advertiser/dashboard";
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create advertiser profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Advertiser onboarding"
        title="Register your campaign wallet"
        description="Connect a wallet — Solana for native campaigns, or any EVM (Base/Arb/OP/Polygon/Monad) to deposit budget that auto-bridges to Solana via Circle CCTP."
      />

      <Card className="max-w-2xl">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Choose identity
            </p>
            {!evm.address ? (
              <ConnectButton chainStatus="icon" showBalance={false} />
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <WalletOptionCard
              kind="solana"
              active={identity?.kind === "solana"}
              connected={Boolean(solanaAddress)}
              title="Solana"
              subtitle="Native rewards on Solana devnet"
              address={solanaAddress}
              disabled={!solanaAddress}
              onSelect={() => setPreferred("solana")}
            />
            <WalletOptionCard
              kind="evm"
              active={identity?.kind === "evm"}
              connected={Boolean(evm.address)}
              title="EVM"
              subtitle={activeChainMeta ? activeChainMeta.label : "Base / Arb / OP / Polygon / Monad"}
              address={evm.address}
              disabled={!evm.address}
              onSelect={() => setPreferred("evm")}
            />
          </div>

          {evm.address ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <span>Manage EVM wallet & chain</span>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          ) : null}

          {identity?.kind === "evm" && !identity.token ? (
            <div className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
              <ShieldCheck className="size-4" />
              You'll be asked to sign one message in MetaMask to prove
              ownership when you create your profile.
            </div>
          ) : null}

          {identity?.kind === "evm" && identity.token ? (
            <Badge variant="outline" className="text-emerald-400">
              ✓ Signed in as EVM advertiser
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Vista Labs"
                required
                value={companyName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walletAddress">Wallet address</Label>
              <Input
                id="walletAddress"
                readOnly
                value={identity?.address ?? ""}
                placeholder="Connect a wallet above"
              />
            </div>

            <Button
              disabled={isSubmitting || !identity || companyName.length === 0}
              type="submit"
            >
              {isSubmitting
                ? "Creating profile…"
                : identity?.kind === "evm" && !identity.token
                  ? "Sign in & create profile"
                  : "Create advertiser profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function truncate(addr: string, head = 6, tail = 4) {
  if (!addr) return "";
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function WalletOptionCard({
  kind,
  active,
  connected,
  title,
  subtitle,
  address,
  disabled,
  onSelect,
}: {
  kind: "solana" | "evm";
  active: boolean;
  connected: boolean;
  title: string;
  subtitle: string;
  address: string | undefined;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border/70 bg-background/70 hover:border-border",
        disabled && "opacity-60",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
          active
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/70 bg-background text-foreground",
        )}
      >
        <span className="text-[10px] font-semibold tracking-wider">
          {kind === "solana" ? "SOL" : "EVM"}
        </span>
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{title}</p>
          {connected ? (
            <Badge variant="outline" className="gap-1 text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {address ? truncate(address, 6, 4) : "—"}
        </p>
      </div>
    </button>
  );
}
