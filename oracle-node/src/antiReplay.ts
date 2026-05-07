/**
 * Bounded-size LRU + TTL nonce cache. Rejects:
 *   - timestamps drifting more than `maxDriftMs` from now
 *   - duplicate nonces seen within the TTL window
 */
export class AntiReplay {
  private nonces = new Map<string, number>();

  constructor(
    private readonly maxDriftMs: number,
    private readonly lruSize: number,
    private readonly ttlMs: number,
  ) {}

  check(nonce: string, timestamp: number): { ok: true } | { ok: false; reason: string } {
    const now = Date.now();
    if (Math.abs(now - timestamp) > this.maxDriftMs) {
      return { ok: false, reason: "timestamp drift exceeds limit" };
    }

    // Evict expired entries before doing the duplicate check.
    if (this.nonces.size > 0) {
      for (const [n, ts] of this.nonces) {
        if (now - ts > this.ttlMs) this.nonces.delete(n);
        else break; // Map preserves insertion order; oldest first
      }
    }

    if (this.nonces.has(nonce)) {
      return { ok: false, reason: "nonce already seen" };
    }
    this.nonces.set(nonce, now);

    // LRU cap: drop oldest entries when we exceed the bound.
    while (this.nonces.size > this.lruSize) {
      const oldest = this.nonces.keys().next().value;
      if (oldest === undefined) break;
      this.nonces.delete(oldest);
    }

    return { ok: true };
  }
}
