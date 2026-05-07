import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";

import type { OracleConfig } from "./config.js";
import type { SyncClient } from "./syncClient.js";

/**
 * Thin wrapper around connection.onLogs that decodes Anchor events from three
 * programs and POSTs them to the dashboard via SyncClient.
 *
 * Subscription IDs are tracked so the listener can be torn down cleanly.
 */
export class EventListener {
  private subIds: number[] = [];

  constructor(
    private readonly cfg: OracleConfig,
    private readonly connection: Connection,
    private readonly sync: SyncClient,
  ) {}

  /**
   * Subscribe to logs for all three programs and start piping decoded events
   * to the dashboard. Returns once all subscriptions are registered.
   *
   * Note: because we cannot `require()` the IDL JSON at runtime in an ESM
   * context without bundling, we use the raw log-prefix approach here and
   * dispatch known event discriminators manually. A future refactor can inline
   * the IDL event schemas for full EventParser support.
   */
  start(): void {
    const programs: Array<{ label: string; programId: PublicKey }> = [
      { label: "oracle_registry", programId: this.cfg.programs.oracleRegistry },
      { label: "attention_aggregator", programId: this.cfg.programs.attentionAggregator },
      { label: "vista_protocol", programId: this.cfg.programs.vistaProtocol },
    ];

    for (const { label, programId } of programs) {
      const id = this.connection.onLogs(
        programId,
        (logs, ctx) => {
          for (const log of logs.logs) {
            this.handleLog(label, programId, log, ctx.slot).catch((err) => {
              console.warn(`[event-listener] ${label} log handler error:`, err);
            });
          }
        },
        "confirmed",
      );
      this.subIds.push(id);
      console.log(`[event-listener] subscribed to ${label} (${programId.toBase58()}) sub=${id}`);
    }
  }

  stop(): void {
    for (const id of this.subIds) {
      this.connection.removeOnLogsListener(id).catch(() => {});
    }
    this.subIds = [];
  }

  private async handleLog(
    program: string,
    _programId: PublicKey,
    log: string,
    slot: number,
  ): Promise<void> {
    // Anchor emits events as: "Program log: <base64-encoded-event>"
    // followed by a raw "Program data: <base64>" line on newer Anchor versions.
    // We recognise the human-readable event names emitted as structured logs.
    const dataPrefix = "Program data: ";
    if (!log.startsWith(dataPrefix)) return;

    const b64 = log.slice(dataPrefix.length).trim();
    let raw: Buffer;
    try {
      raw = Buffer.from(b64, "base64");
    } catch {
      return;
    }

    if (raw.length < 8) return;
    const disc = raw.subarray(0, 8).toString("hex");

    // Build a discriminator from an event name the same way Anchor does:
    //   sha256("event:<Name>")[0..8]
    const mkDisc = (name: string) =>
      createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex");

    const payload: Record<string, unknown> = { slot };

    if (program === "oracle_registry") {
      if (disc === mkDisc("OracleRegistered")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        payload.oracle = oracle;
        await this.sync.post({ event: "registered", payload: { oracle, slot } });
        return;
      }
      if (disc === mkDisc("OracleSlashed")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        await this.sync.post({ event: "slashed", payload: { oracle, amount: amount.toString(), slot } });
        return;
      }
      if (disc === mkDisc("RewardCredited")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        const sessionIdHex = raw.subarray(48, 80).toString("hex");
        await this.sync.post({
          event: "reward_credited",
          payload: { oracle, amount: amount.toString(), session_id: sessionIdHex, slot },
        });
        return;
      }
      if (disc === mkDisc("RewardsClaimed")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        await this.sync.post({ event: "rewards_claimed", payload: { oracle, amount: amount.toString(), slot } });
        return;
      }
    }

    if (program === "attention_aggregator") {
      if (disc === mkDisc("VerificationSubmitted")) {
        const sessionIdHex = raw.subarray(8, 40).toString("hex");
        const oracle = new PublicKey(raw.subarray(40, 72)).toBase58();
        const score = raw.readUInt8(72);
        await this.sync.post({
          event: "submission",
          payload: {
            oracle,
            session_id_onchain: `0x${sessionIdHex}`,
            score,
            submitted_at: new Date().toISOString(),
            slot,
          },
        });
        return;
      }
      if (disc === mkDisc("SessionAggregated")) {
        const sessionIdHex = raw.subarray(8, 40).toString("hex");
        const consensusScore = raw.readUInt8(40);
        const consensusReached = raw.readUInt8(41) === 1;
        const outlierCount = raw.readUInt8(42);
        await this.sync.post({
          event: "session_aggregated",
          payload: {
            session_id_onchain: `0x${sessionIdHex}`,
            consensus_score: consensusScore,
            consensus_reached: consensusReached,
            outlier_count: outlierCount,
            slot,
          },
        });
        return;
      }
    }
  }
}
