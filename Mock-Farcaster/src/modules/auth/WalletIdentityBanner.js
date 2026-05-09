"use client";

import { useEvmWallet } from "@/modules/auth/useEvmWallet";
import { useIdentityResolver } from "@/modules/auth/useIdentityResolver";

function truncate(addr, head = 6, tail = 4) {
  if (!addr) return "";
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * Identity banner that lets the user pick which wallet identity should
 * receive attention earnings:
 *
 *   - **Solana primary** (default): the wallet they logged in with — earnings
 *     credit directly.
 *   - **EVM identity**: any EVM wallet (Base/Arb/Optimism/Polygon/Monad)
 *     they previously linked at /user/identity on the dashboard. The
 *     oracle-node resolves the EVM address back to the same Solana primary
 *     before calling start_stream — so settlement still lands in the Solana
 *     wallet, but the user can watch from a different chain's wallet.
 *
 * Calls onActiveWalletChange(wallet | null) — null means "use the default
 * (Solana login wallet)".
 */
export default function WalletIdentityBanner({
  solanaPrimary,
  onActiveWalletChange,
}) {
  const evm = useEvmWallet();
  const resolved = useIdentityResolver(evm.address);

  const usingEvm = Boolean(evm.isConnected && evm.address);
  const linkedToCorrectPrimary =
    resolved.primaryWallet && resolved.primaryWallet === solanaPrimary;

  // Notify parent whenever the effective active wallet changes. We intentionally
  // pass the raw EVM address (not the resolved Solana) because the oracle does
  // the resolution server-side from the heartbeat — this preserves the audit
  // trail of which wallet actually generated the attention.
  function handleUseEvm() {
    if (!evm.isConnected) {
      evm.connect().then((addr) => {
        if (addr) onActiveWalletChange(addr);
      });
    } else {
      onActiveWalletChange(evm.address);
    }
  }

  function handleUseSolana() {
    onActiveWalletChange(null); // null = default to Solana login wallet
  }

  return (
    <div className="border-b border-white/10 px-5 py-3 text-sm bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
          Active identity
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUseSolana}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !usingEvm || !evm.address
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            Solana ({truncate(solanaPrimary)})
          </button>
          <button
            type="button"
            onClick={handleUseEvm}
            disabled={!evm.available || evm.connecting}
            className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
              usingEvm && evm.address
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {evm.connecting
              ? "Connecting…"
              : evm.address
                ? `EVM (${truncate(evm.address)})`
                : "Connect EVM"}
          </button>
        </div>

        {evm.address ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {resolved.loading ? (
              <span className="text-zinc-500">Resolving…</span>
            ) : resolved.primaryWallet ? (
              <>
                <span className="text-zinc-400">→ settling to Solana</span>
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200">
                  {truncate(resolved.primaryWallet)}
                </code>
                {linkedToCorrectPrimary ? (
                  <span className="text-emerald-400">✓ linked</span>
                ) : (
                  <span className="text-amber-400">
                    ⚠ links to a different Solana wallet
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-400">
                Not linked.{" "}
                <a
                  href={`${process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ?? "http://localhost:3031"}/user/identity`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Link at dashboard
                </a>
              </span>
            )}
          </div>
        ) : null}

        {evm.error ? (
          <span className="text-xs text-red-400">{evm.error}</span>
        ) : null}

        {!evm.available ? (
          <span className="text-xs text-zinc-500">
            (No EVM wallet detected)
          </span>
        ) : null}
      </div>
    </div>
  );
}
