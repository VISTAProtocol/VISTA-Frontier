import type { OracleConfig, EvmChainConfig } from "./config.js";
import type { SyncClient } from "./syncClient.js";

export interface CctpJob {
  campaignId: `0x${string}`;
  sourceChain: EvmChainConfig;
  cctpNonce: bigint;
  /// EVM transaction hash where the CCTP burn happened. Circle's Iris API
  /// keys attestations by `messageHash` derived from the burn message bytes;
  /// for the hackathon we pass the tx hash to a `byTxHash` Iris endpoint
  /// (sandbox supports this) and let it resolve the underlying message.
  sourceTxHash: `0x${string}`;
  /// USDC amount (in micro-USDC, 6 decimals) the EVM advertiser committed.
  /// Carried through so the Solana relayer can mint the matching amount of
  /// VISTA-side USDC into the per-campaign vault once Circle has attested
  /// the EVM-side burn (Arsitektur 2: CCTP attestation = finality proof,
  /// Solana mint authority issues the equivalent supply on Solana).
  totalBudget: bigint;
}

interface AttestationResponse {
  status: "pending_confirmations" | "complete" | string;
  attestation?: string;
  message?: string;
}

interface OnAttested {
  (job: CctpJob, attestation: AttestationResponse): Promise<void>;
}

/// Polls Circle's Iris API for CCTP attestations. On completion, fires
/// `onAttested` so the parent (oracle index) can submit the Solana
/// MessageTransmitter `receive_message` + vista_bridge `confirm_usdc_received`
/// pair, then PATCHes the dashboard with the final state.
///
/// Intentionally simple: in-memory queue, polled on a single timer. Restarting
/// the oracle node loses pending jobs — for the hackathon that's acceptable
/// because the dashboard already persists `bridge_status='evm_confirmed'`
/// rows; a fresh run can be re-enqueued from those rows on startup if needed.
export class CctpWatcher {
  private readonly jobs = new Map<string, { job: CctpJob; firstAt: number }>();
  private interval?: NodeJS.Timeout;
  private onAttested?: OnAttested;

  constructor(
    private readonly cfg: OracleConfig,
    private readonly sync: SyncClient,
  ) {}

  setOnAttested(handler: OnAttested): void {
    this.onAttested = handler;
  }

  start(): void {
    if (!this.cfg.crossChain.enabled) {
      console.log("[cctp-watcher] cross-chain disabled; skipping");
      return;
    }
    if (this.interval) return;
    this.interval = setInterval(
      () => void this.tick(),
      this.cfg.crossChain.cctpPollIntervalMs,
    );
    this.interval.unref?.();
    console.log(
      `[cctp-watcher] polling ${this.cfg.crossChain.cctpAttestationUrl} every ${this.cfg.crossChain.cctpPollIntervalMs}ms`,
    );
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }

  enqueue(job: CctpJob): void {
    if (this.jobs.has(job.campaignId)) return;
    this.jobs.set(job.campaignId, { job, firstAt: Date.now() });
    console.log(
      `[cctp-watcher] enqueued campaign=${job.campaignId} nonce=${job.cctpNonce} chain=${job.sourceChain.key}`,
    );
  }

  private async tick(): Promise<void> {
    if (this.jobs.size === 0) return;
    const now = Date.now();

    for (const [key, { job, firstAt }] of this.jobs) {
      if (now - firstAt > this.cfg.crossChain.cctpMaxWaitMs) {
        console.warn(
          `[cctp-watcher] campaign=${key} timed out waiting for attestation; dropping`,
        );
        this.jobs.delete(key);
        await this.sync.post({
          event: "cross_chain_failed",
          payload: {
            campaign_id_onchain: key,
            stage: "cctp_attestation",
            error: `attestation timeout after ${this.cfg.crossChain.cctpMaxWaitMs}ms`,
          },
        });
        continue;
      }

      try {
        const att = await this.fetchAttestation(job);
        if (!att) continue;
        if (att.status !== "complete") continue;

        console.log(
          `[cctp-watcher] attestation complete for campaign=${key}`,
        );
        await this.sync.post({
          event: "cross_chain_attested",
          payload: {
            campaign_id_onchain: key,
            cctp_nonce: job.cctpNonce.toString(),
            observed_at: new Date().toISOString(),
          },
        });

        if (this.onAttested) {
          await this.onAttested(job, att);
        } else {
          console.warn(
            `[cctp-watcher] no onAttested handler set; campaign=${key} will not finalize on Solana automatically`,
          );
        }
        this.jobs.delete(key);
      } catch (err) {
        console.warn(
          `[cctp-watcher] poll error for campaign=${key}:`,
          err,
        );
        // Leave job queued — next tick will retry.
      }
    }
  }

  private async fetchAttestation(job: CctpJob): Promise<AttestationResponse | null> {
    // Circle Iris exposes `/v1/messages/{sourceDomainId}/{txHash}` returning
    // an array of CCTP messages emitted in the tx. We look for the one whose
    // nonce matches our recorded cctpNonce.
    const url = `${this.cfg.crossChain.cctpAttestationUrl.replace(/\/+$/, "")}/v1/messages/${job.sourceChain.cctpSourceDomain}/${job.sourceTxHash}`;
    const res = await fetch(url);
    if (res.status === 404) return null; // not yet indexed
    if (!res.ok) {
      throw new Error(`iris responded ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      messages?: Array<{
        attestation?: string;
        message?: string;
        eventNonce?: string;
        status?: string;
      }>;
    };

    const matched = body.messages?.find(
      (m) => m.eventNonce === job.cctpNonce.toString(),
    );
    if (!matched) return null;

    return {
      status: matched.status === "complete" || matched.attestation
        ? "complete"
        : "pending_confirmations",
      attestation: matched.attestation,
      message: matched.message,
    };
  }
}
