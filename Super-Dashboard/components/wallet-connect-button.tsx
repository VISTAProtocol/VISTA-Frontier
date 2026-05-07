"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, truncateAddress } from "@/lib/utils";

export function WalletConnectButton({ className }: { className?: string }) {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (connecting) {
    return (
      <Button className={className} variant="outline" disabled>
        Connecting…
      </Button>
    );
  }

  if (!publicKey) {
    return (
      <Button className={className} onClick={() => setVisible(true)}>
        <Wallet className="size-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button onClick={disconnect} variant="secondary">
        <Wallet className="size-4" />
        {truncateAddress(publicKey.toBase58())}
      </Button>
    </div>
  );
}
