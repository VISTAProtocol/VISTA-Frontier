import type { OracleEndpointProvider } from './HeartbeatSender';

const REFRESH_INTERVAL_MS = 60_000;

interface ActiveNode {
  oracle_pubkey: string;
  endpoint_url: string;
  active: boolean;
}

/**
 * Combines an optional static set of oracle URLs (from `VistaConfig.oracleUrl`)
 * with a dynamically-refreshed list pulled from
 * `${dashboardUrl}/api/oracle/active-nodes`. Heartbeats fan out to the union.
 *
 * The trustless default is to leave `staticUrls` empty and let the dashboard
 * advertise the active oracle set. A non-empty `staticUrls` still works as a
 * "trust one oracle" override.
 */
export class OracleDiscovery implements OracleEndpointProvider {
  private staticEndpoints: string[];
  private dynamicEndpoints: string[] = [];
  private dashboardUrl: string | null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(staticUrls: string | string[] = [], dashboardUrl?: string) {
    const arr = Array.isArray(staticUrls) ? staticUrls : [staticUrls];
    this.staticEndpoints = arr.map((u) => u.replace(/\/+$/, '')).filter(Boolean);
    this.dashboardUrl = dashboardUrl?.replace(/\/+$/, '') ?? null;
  }

  start(): void {
    if (!this.dashboardUrl) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.dynamicEndpoints = [];
  }

  getEndpoints(): string[] {
    // Dedup union of static + dynamic.
    const set = new Set<string>();
    for (const u of this.staticEndpoints) set.add(u);
    for (const u of this.dynamicEndpoints) set.add(u);
    return [...set];
  }

  private async refresh(): Promise<void> {
    if (!this.dashboardUrl) return;
    try {
      const res = await fetch(`${this.dashboardUrl}/api/oracle/active-nodes`);
      if (!res.ok) return;
      const json = (await res.json()) as { nodes?: ActiveNode[] };
      const nodes = (json.nodes ?? [])
        .filter((n) => n.active && n.endpoint_url)
        .map((n) => n.endpoint_url.replace(/\/+$/, ''));
      this.dynamicEndpoints = nodes;
    } catch (err) {
      console.warn('[VISTA] active-nodes refresh failed:', err);
    }
  }
}
