"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/http";
import { useEvmAuth } from "@/lib/use-evm-auth";
import { useVistaWallet } from "@/lib/use-vista-wallet";

type Identity =
  | { kind: "solana"; address: string }
  | { kind: "evm"; address: `0x${string}`; token: string | null };

export default function AdvertiserOnboardingPage() {
  const { address: solanaAddress } = useVistaWallet();
  const evm = useEvmAuth();

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
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Choose identity
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={
                identity?.kind === "solana" ? "default" : "outline"
              }
              onClick={() => setPreferred("solana")}
              disabled={!solanaAddress}
            >
              {solanaAddress
                ? `Solana ${truncate(solanaAddress)}`
                : "Solana (not connected)"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={identity?.kind === "evm" ? "default" : "outline"}
                onClick={() => setPreferred("evm")}
                disabled={!evm.address}
              >
                {evm.address
                  ? `EVM ${truncate(evm.address)}`
                  : "EVM (connect below)"}
              </Button>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          </div>

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
