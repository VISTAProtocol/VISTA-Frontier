"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Vista } from "@/lib/vista-sdk";
import { buildWalletAuthMessage } from "@/lib/auth/sign-message";

export default function AuthPage() {
  const router = useRouter();
  const { publicKey, connected, disconnect, connecting, signMessage } = useWallet();
  const { setVisible } = useWalletModal();

  const [errorMessage, setErrorMessage] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const address = publicKey?.toBase58() ?? null;
  const walletAddressLabel = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }, [address]);

  useEffect(() => {
    if (!connected || !address) return;

    let active = true;
    setIsAuthenticating(true);
    setErrorMessage("");

    (async () => {
      try {
        // 1) SIWS sign-in: request nonce → wallet.signMessage → verify → cookie set
        if (typeof signMessage !== "function") {
          throw new Error("Wallet does not support message signing.");
        }

        const nonceRes = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const nonceData = await nonceRes.json();
        if (!nonceRes.ok || !nonceData?.nonce) {
          throw new Error(nonceData?.error || "Failed to obtain nonce.");
        }

        const issuedAt = new Date().toISOString();
        const message = buildWalletAuthMessage({
          domain: window.location.host,
          uri: window.location.origin,
          address,
          nonce: nonceData.nonce,
          issuedAt,
        });

        const signatureBytes = await signMessage(new TextEncoder().encode(message));
        const signature = bs58.encode(signatureBytes);

        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address,
            message,
            signature,
            nonce: nonceData.nonce,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData?.ok) {
          throw new Error(verifyData?.error || "Signature verification failed.");
        }

        if (!active) return;

        // 2) Onboarding gate: prompt registration if user record missing.
        const userCheck = await fetch(
          `/api/users?userWallet=${encodeURIComponent(address)}`,
        );
        const userData = userCheck.ok ? await userCheck.json() : null;
        if (!active) return;

        const isRegistered =
          userData?.wallet_address &&
          userData.wallet_address === address;

        if (!isRegistered) {
          const dashboardUrl =
            process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ||
            "http://localhost:3031";
          Vista.showOnboardingModal({ dashboardUrl, wallet: address });
          router.push("/");
          router.refresh();
          return;
        }

        router.push("/");
        router.refresh();
      } catch (err) {
        if (!active) return;
        console.error("SIWS auth failed:", err);
        setErrorMessage(err?.message || "Failed to sign in with Solana.");
      } finally {
        if (active) setIsAuthenticating(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [connected, address, router, signMessage]);

  return (
    <main className="min-h-screen bg-[#06070a] px-4 py-8 text-zinc-100">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Wallet Authentication
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Connect to Solana Devnet
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Connect your Phantom/Solflare wallet to enter the Vista feed.
        </p>

        <div className="mt-6 grid gap-3">
          {!connected ? (
            <button
              type="button"
              onClick={() => setVisible(true)}
              disabled={connecting}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          ) : (
            <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wider text-emerald-200">
                Connected Wallet
              </p>
              <p className="font-mono text-sm text-emerald-100">
                {walletAddressLabel}
              </p>
              <p className="text-xs text-zinc-300">
                Network: Solana Devnet
                {isAuthenticating ? " · Signing in…" : ""}
              </p>
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  setErrorMessage("");
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                Disconnect Wallet
              </button>
            </div>
          )}

          {errorMessage ? (
            <p className="text-sm text-rose-400">{errorMessage}</p>
          ) : null}
        </div>

        <Link
          href="/"
          className="mt-5 inline-flex text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
