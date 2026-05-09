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

    const isoFromUnix = (secs: bigint | number) =>
      new Date(Number(secs) * 1000).toISOString();

    if (program === "oracle_registry") {
      // OracleRegistered { oracle: Pubkey(32), stake: u64(8), endpoint_url: String(4+N), timestamp: i64(8) }
      if (disc === mkDisc("OracleRegistered")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const stake = raw.readBigUInt64LE(40);
        const endpointLen = raw.readUInt32LE(48);
        const endpointUrl = raw.subarray(52, 52 + endpointLen).toString("utf8");
        const timestamp = raw.readBigInt64LE(52 + endpointLen);
        await this.sync.post({
          event: "registered",
          payload: {
            oracle,
            endpoint_url: endpointUrl,
            stake_amount: Number(stake),
            registered_at: isoFromUnix(timestamp),
          },
        });
        return;
      }
      // OracleSlashed { oracle: Pubkey(32), amount: u64(8), timestamp: i64(8) }
      if (disc === mkDisc("OracleSlashed")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        const timestamp = raw.readBigInt64LE(48);
        await this.sync.post({
          event: "slashed",
          payload: {
            oracle,
            amount: amount.toString(),
            timestamp: isoFromUnix(timestamp),
          },
        });
        return;
      }
      // RewardCredited { oracle: Pubkey(32), amount: u64(8), session_id: [u8;32] }
      if (disc === mkDisc("RewardCredited")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        const sessionIdHex = raw.subarray(48, 80).toString("hex");
        await this.sync.post({
          event: "reward_credited",
          payload: {
            oracle,
            amount: amount.toString(),
            session_id_onchain: `0x${sessionIdHex}`,
          },
        });
        return;
      }
      // RewardsClaimed { oracle: Pubkey(32), amount: u64(8), timestamp: i64(8) }
      if (disc === mkDisc("RewardsClaimed")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        const timestamp = raw.readBigInt64LE(48);
        await this.sync.post({
          event: "rewards_claimed",
          payload: {
            oracle,
            amount: amount.toString(),
            timestamp: isoFromUnix(timestamp),
          },
        });
        return;
      }
      // OracleUnregistered { oracle: Pubkey(32), timestamp: i64(8) }
      if (disc === mkDisc("OracleUnregistered")) {
        const oracle = new PublicKey(raw.subarray(8, 40)).toBase58();
        const timestamp = raw.readBigInt64LE(40);
        await this.sync.post({
          event: "unregistered",
          payload: {
            oracle,
            unregistered_at: isoFromUnix(timestamp),
          },
        });
        return;
      }
    }

    if (program === "vista_protocol") {
      // CampaignCreated { campaign_id: [u8;32], advertiser: Pubkey(32),
      //   amount: u64(8), rate_per_second: u64(8) }
      if (disc === mkDisc("CampaignCreated")) {
        const campaignId = `0x${raw.subarray(8, 40).toString("hex")}`;
        const advertiser = new PublicKey(raw.subarray(40, 72)).toBase58();
        const amount = raw.readBigUInt64LE(72);
        const ratePerSecond = raw.readBigUInt64LE(80);
        await this.sync.post({
          event: "campaign_created",
          payload: {
            campaign_id_onchain: campaignId,
            advertiser_wallet: advertiser,
            total_budget: amount.toString(),
            rate_per_second: ratePerSecond.toString(),
            block_slot: slot,
          },
        });
        return;
      }
      // StreamStarted { session_id: [u8;32], campaign_id: [u8;32],
      //   user_wallet: Pubkey, publisher_wallet: Pubkey }
      if (disc === mkDisc("StreamStarted")) {
        const sessionId = `0x${raw.subarray(8, 40).toString("hex")}`;
        const campaignId = `0x${raw.subarray(40, 72).toString("hex")}`;
        const userWallet = new PublicKey(raw.subarray(72, 104)).toBase58();
        const publisherWallet = new PublicKey(raw.subarray(104, 136)).toBase58();
        await this.sync.post({
          event: "stream_started",
          payload: {
            session_id_onchain: sessionId,
            campaign_id_onchain: campaignId,
            user_wallet: userWallet,
            publisher_wallet: publisherWallet,
            started_at: new Date().toISOString(),
          },
        });
        return;
      }
      // StreamTick { session_id, user_wallet, publisher_wallet,
      //   total_amount, user_amount, publisher_amount, validator_amount,
      //   vista_amount, timestamp }
      if (disc === mkDisc("StreamTick")) {
        const sessionId = `0x${raw.subarray(8, 40).toString("hex")}`;
        const userWallet = new PublicKey(raw.subarray(40, 72)).toBase58();
        const publisherWallet = new PublicKey(raw.subarray(72, 104)).toBase58();
        const totalAmount = raw.readBigUInt64LE(104);
        const userAmount = raw.readBigUInt64LE(112);
        const publisherAmount = raw.readBigUInt64LE(120);
        const validatorAmount = raw.readBigUInt64LE(128);
        const vistaAmount = raw.readBigUInt64LE(136);
        const timestamp = raw.readBigInt64LE(144);
        await this.sync.post({
          event: "stream_tick",
          payload: {
            session_id_onchain: sessionId,
            user_wallet: userWallet,
            publisher_wallet: publisherWallet,
            total_amount: totalAmount.toString(),
            user_amount: userAmount.toString(),
            publisher_amount: publisherAmount.toString(),
            validator_amount: validatorAmount.toString(),
            vista_amount: vistaAmount.toString(),
            block_timestamp: isoFromUnix(timestamp),
          },
        });
        return;
      }
      // StreamEnded { session_id, seconds_verified: u64, total_paid: u64 }
      if (disc === mkDisc("StreamEnded")) {
        const sessionId = `0x${raw.subarray(8, 40).toString("hex")}`;
        const secondsVerified = raw.readBigUInt64LE(40);
        const totalPaid = raw.readBigUInt64LE(48);
        await this.sync.post({
          event: "stream_ended",
          payload: {
            session_id_onchain: sessionId,
            seconds_verified: Number(secondsVerified),
            total_paid: totalPaid.toString(),
            ended_at: new Date().toISOString(),
          },
        });
        return;
      }
      // ReceiptMinted { user: Pubkey, token_id: u64, session_id: [u8;32],
      //   campaign_id: [u8;32], seconds_verified: u64, usdc_paid: u64 }
      if (disc === mkDisc("ReceiptMinted")) {
        const user = new PublicKey(raw.subarray(8, 40)).toBase58();
        const tokenId = raw.readBigUInt64LE(40);
        const sessionId = `0x${raw.subarray(48, 80).toString("hex")}`;
        const campaignId = `0x${raw.subarray(80, 112).toString("hex")}`;
        const secondsVerified = raw.readBigUInt64LE(112);
        const usdcPaid = raw.readBigUInt64LE(120);
        await this.sync.post({
          event: "receipt_minted",
          payload: {
            token_id: tokenId.toString(),
            session_id_onchain: sessionId,
            campaign_id_onchain: campaignId,
            user_wallet: user,
            seconds_verified: Number(secondsVerified),
            usdc_paid: usdcPaid.toString(),
            minted_at: new Date().toISOString(),
          },
        });
        return;
      }
      // Withdrawn { wallet: Pubkey, amount: u64 }
      if (disc === mkDisc("Withdrawn")) {
        const wallet = new PublicKey(raw.subarray(8, 40)).toBase58();
        const amount = raw.readBigUInt64LE(40);
        await this.sync.post({
          event: "withdrawn",
          payload: {
            wallet,
            amount: amount.toString(),
            withdrawn_at: new Date().toISOString(),
          },
        });
        return;
      }
    }

    if (program === "attention_aggregator") {
      // VerificationSubmitted { session_id: [u8;32], oracle: Pubkey(32), score: u8, timestamp: i64(8) }
      if (disc === mkDisc("VerificationSubmitted")) {
        const sessionIdHex = raw.subarray(8, 40).toString("hex");
        const oracle = new PublicKey(raw.subarray(40, 72)).toBase58();
        const score = raw.readUInt8(72);
        const timestamp = raw.readBigInt64LE(73);
        await this.sync.post({
          event: "submission",
          payload: {
            oracle,
            session_id_onchain: `0x${sessionIdHex}`,
            score,
            submitted_at: isoFromUnix(timestamp),
          },
        });
        return;
      }
      // SessionAggregated {
      //   session_id: [u8;32], consensus_score: u8, consensus_reached: bool,
      //   honest_count: u8, slashed_count: u8, per_oracle_reward: u64, settled_at: i64,
      // }
      // Receiver expects outliers[] / honest[] arrays of pubkeys but the on-chain
      // event only carries counts. We fan-out empty arrays here — the dashboard
      // can backfill the per-oracle attribution from the OutlierDetected /
      // RewardCredited events that fire alongside this one.
      if (disc === mkDisc("SessionAggregated")) {
        const sessionIdHex = raw.subarray(8, 40).toString("hex");
        const consensusScore = raw.readUInt8(40);
        // skip consensus_reached (1 byte at 41), honest_count (42), slashed_count (43)
        const perOracleReward = raw.readBigUInt64LE(44);
        const settledAt = raw.readBigInt64LE(52);
        await this.sync.post({
          event: "session_aggregated",
          payload: {
            session_id_onchain: `0x${sessionIdHex}`,
            consensus_score: consensusScore,
            outliers: [],
            honest: [],
            per_oracle_reward: Number(perOracleReward),
            settled_at: isoFromUnix(settledAt),
          },
        });
        return;
      }
    }
  }
}
