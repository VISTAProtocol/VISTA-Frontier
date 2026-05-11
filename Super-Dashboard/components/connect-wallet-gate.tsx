"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { roleMeta } from "@/lib/constants";
import type { RoleName } from "@/lib/types";
import { useVistaWallet } from "@/lib/use-vista-wallet";

/// Inline wallet-connect prompt used by RoleGuard / RoleEntryRedirect. Non
/// non-advertiser routes require a Solana wallet (the protocol's settlement
/// chain). Advertiser routes additionally accept an EVM wallet so cross-chain
/// campaign deposits can flow through Circle CCTP.
export function ConnectWalletGate({ role }: { role: RoleName }) {
  const meta = roleMeta[role];
  const allowsEvm = role === "advertiser";

  const { openConnectModal } = useVistaWallet();

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 text-primary">
              <Wallet className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Connect your wallet
            </h1>
            <p className="text-sm text-muted-foreground">
              {allowsEvm
                ? `Connect a Solana wallet for native ${meta.label.toLowerCase()} flows, or an EVM wallet to fund campaigns from Base, Arbitrum, Optimism, Polygon, or Monad.`
                : `The ${meta.label} workspace settles on Solana. Connect a Solana wallet (Phantom, Solflare, etc.) to continue.`}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Solana
                  </p>
                  <p className="text-sm text-foreground">
                    Phantom · Solflare · Wallet Standard
                  </p>
                </div>
                <Button onClick={() => openConnectModal?.()}>
                  <Wallet className="size-4" />
                  Connect Solana
                </Button>
              </div>
            </div>

            {allowsEvm ? (
              <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      EVM
                    </p>
                    <p className="text-sm text-foreground">
                      Base · Arbitrum · Optimism · Polygon · Monad
                    </p>
                  </div>
                  <ConnectButton
                    chainStatus="icon"
                    showBalance={false}
                    accountStatus="address"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            No sign-up · No email · Disconnect anytime
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
