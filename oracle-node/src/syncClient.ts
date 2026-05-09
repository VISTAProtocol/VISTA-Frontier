import type { OracleConfig } from "./config.js";

export type OracleSyncEvent =
  | { event: "registered"; payload: Record<string, unknown> }
  | { event: "unregistered"; payload: Record<string, unknown> }
  | { event: "slashed"; payload: Record<string, unknown> }
  | { event: "reward_credited"; payload: Record<string, unknown> }
  | { event: "rewards_claimed"; payload: Record<string, unknown> }
  | { event: "submission"; payload: Record<string, unknown> }
  | { event: "session_aggregated"; payload: Record<string, unknown> }
  | { event: "cross_chain_evm_confirmed"; payload: Record<string, unknown> }
  | { event: "cross_chain_attested"; payload: Record<string, unknown> }
  | { event: "cross_chain_active"; payload: Record<string, unknown> }
  | { event: "cross_chain_failed"; payload: Record<string, unknown> }
  | { event: "campaign_created"; payload: Record<string, unknown> }
  | { event: "stream_started"; payload: Record<string, unknown> }
  | { event: "stream_tick"; payload: Record<string, unknown> }
  | { event: "stream_ended"; payload: Record<string, unknown> }
  | { event: "receipt_minted"; payload: Record<string, unknown> }
  | { event: "withdrawn"; payload: Record<string, unknown> };

export class SyncClient {
  constructor(private readonly cfg: OracleConfig) {}

  async post(evt: OracleSyncEvent): Promise<void> {
    const url = `${this.cfg.dashboardUrl.replace(/\/+$/, "")}/api/oracle/sync`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-oracle-secret": this.cfg.webhookSecret,
        },
        body: JSON.stringify(evt),
      });
      if (!res.ok) {
        console.warn(
          `[oracle-node] /api/oracle/sync responded ${res.status}: ${await res.text()}`,
        );
      }
    } catch (err) {
      console.warn(`[oracle-node] /api/oracle/sync POST failed:`, err);
    }
  }
}
