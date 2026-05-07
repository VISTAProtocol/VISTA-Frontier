import type { HeartbeatPayload, HeartbeatResponse } from './types';

const HEARTBEAT_INTERVAL_MS = 200;

export interface OracleEndpointProvider {
  /** Return current set of oracle base URLs (no trailing slash). */
  getEndpoints(): string[];
}

export class HeartbeatSender {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private endpointProvider: OracleEndpointProvider;
  /**
   * Coalesce overlapping heartbeats. setInterval can fire while the previous
   * fan-out is still in flight (200ms cadence + slow oracle = tail latency
   * pile-up). We skip a tick rather than letting parallel fan-outs stack.
   */
  private inFlight = false;

  constructor(endpointProvider: OracleEndpointProvider) {
    this.endpointProvider = endpointProvider;
  }

  start(
    getPayload: () => HeartbeatPayload,
    onResponse: (res: HeartbeatResponse) => void,
    shouldSkip?: () => boolean
  ): void {
    this.intervalId = setInterval(async () => {
      if (shouldSkip && shouldSkip()) return;
      if (this.inFlight) return;

      const endpoints = this.endpointProvider.getEndpoints();
      if (endpoints.length === 0) return;

      this.inFlight = true;
      try {
        const payload = getPayload();
        const body = JSON.stringify(payload);

        const results = await Promise.allSettled(
          endpoints.map((url) =>
            fetch(`${url.replace(/\/+$/, '')}/heartbeat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            }).then((r) => r.json() as Promise<HeartbeatResponse>)
          )
        );

        // Pick a representative response for the UI counter. Strategy: prefer
        // any `valid: true` response with the highest validSeconds (so the
        // counter only moves forward); otherwise fall back to the first
        // fulfilled response.
        let pick: HeartbeatResponse | null = null;
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const v = r.value;
          if (!pick) pick = v;
          if (v?.valid && (!pick.valid || (v.validSeconds ?? 0) > (pick.validSeconds ?? 0))) {
            pick = v;
          }
        }
        if (pick) onResponse(pick);

        // Surface partial-fan-out failures only when EVERY oracle fails — a
        // single down node should not noise the console.
        const failures = results.filter((r) => r.status === 'rejected').length;
        if (failures === results.length) {
          console.warn(
            `[VISTA] Heartbeat: all ${results.length} oracles failed. Endpoints:`,
            endpoints
          );
        }
      } catch (err) {
        console.warn('[VISTA] Heartbeat fan-out errored:', err);
      } finally {
        this.inFlight = false;
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
