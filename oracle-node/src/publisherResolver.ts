import type { OracleConfig } from "./config.js";

/**
 * Resolve a publisher's Solana wallet from their `apiKey` by hitting the
 * dashboard's `/api/publishers/verify-apikey` endpoint (oracle-secret
 * gated). Caches forever in-process — apiKey↔wallet mappings are stable
 * for the lifetime of a publisher record.
 */
export class PublisherResolver {
  private cache = new Map<string, string>();
  private inflight = new Map<string, Promise<string | null>>();

  constructor(private readonly cfg: OracleConfig) {}

  async resolve(apiKey: string | undefined): Promise<string | null> {
    if (!apiKey) return null;
    const hit = this.cache.get(apiKey);
    if (hit) return hit;

    const pending = this.inflight.get(apiKey);
    if (pending) return pending;

    const promise = this.fetchOnce(apiKey).finally(() => {
      this.inflight.delete(apiKey);
    });
    this.inflight.set(apiKey, promise);
    return promise;
  }

  private async fetchOnce(apiKey: string): Promise<string | null> {
    const base = this.cfg.dashboardUrl.replace(/\/+$/, "");
    const url = `${base}/api/publishers/verify-apikey?apiKey=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        headers: { "x-oracle-secret": this.cfg.webhookSecret },
      });
      if (!res.ok) {
        if (res.status !== 404) {
          console.warn(
            `[publisher-resolver] verify-apikey responded ${res.status} for apiKey=${apiKey.slice(0, 12)}…`,
          );
        }
        return null;
      }
      const json = (await res.json()) as
        | { publisherWallet?: string; data?: { publisherWallet?: string } }
        | null;
      const wallet =
        json?.publisherWallet ?? json?.data?.publisherWallet ?? null;
      if (wallet) this.cache.set(apiKey, wallet);
      return wallet;
    } catch (err) {
      console.warn("[publisher-resolver] fetch failed:", err);
      return null;
    }
  }
}
