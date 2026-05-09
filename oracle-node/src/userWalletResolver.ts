import type { OracleConfig } from "./config.js";

/**
 * Resolve an arbitrary connected wallet (Solana base58 or EVM 0x hex) to
 * the Solana primary identity that should receive settlement.
 *
 * Hits the dashboard's public `/api/identity/resolve` endpoint. No oracle
 * secret required — the endpoint is read-only and exposes no PII.
 *
 * Caching strategy: shorter TTL than PublisherResolver (5 min) because
 * users can link/unlink wallets at runtime via /user/identity, and we want
 * fresh decisions if a user fixes a misconfigured link mid-session.
 */
export class UserWalletResolver {
  private cache = new Map<string, { wallet: string | null; expires: number }>();
  private inflight = new Map<string, Promise<string | null>>();
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly cfg: OracleConfig) {}

  async resolve(wallet: string | undefined): Promise<string | null> {
    if (!wallet) return null;

    const key = wallet.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.wallet;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = this.fetchOnce(wallet).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private async fetchOnce(wallet: string): Promise<string | null> {
    const base = this.cfg.dashboardUrl.replace(/\/+$/, "");
    const url = `${base}/api/identity/resolve?wallet=${encodeURIComponent(wallet)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status !== 404) {
          console.warn(
            `[user-wallet-resolver] resolve responded ${res.status} for wallet=${wallet.slice(0, 12)}…`,
          );
        }
        this.cacheNull(wallet);
        return null;
      }
      const json = (await res.json()) as
        | { primaryWallet?: string | null }
        | null;
      const primary = json?.primaryWallet ?? null;
      this.cache.set(wallet.toLowerCase(), {
        wallet: primary,
        expires: Date.now() + this.ttlMs,
      });
      return primary;
    } catch (err) {
      console.warn("[user-wallet-resolver] fetch failed:", err);
      this.cacheNull(wallet);
      return null;
    }
  }

  private cacheNull(wallet: string) {
    // Negative cache with shorter TTL so failures don't pin "no link" for
    // the full TTL — user might link the wallet right after seeing the
    // failure in a publisher's UI.
    this.cache.set(wallet.toLowerCase(), {
      wallet: null,
      expires: Date.now() + 30_000,
    });
  }
}
