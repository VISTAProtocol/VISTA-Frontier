import {
  createPublicClient,
  http,
  parseAbi,
  parseEventLogs,
  type Log,
  type PublicClient,
} from "viem";

import type { EvmChainConfig, OracleConfig } from "./config.js";
import type { SyncClient } from "./syncClient.js";
import type { CctpWatcher } from "./cctpWatcher.js";

/// Bounded chunk size to keep within RPC `eth_getLogs` block-range caps.
/// Alchemy free tier caps at 10 blocks per request (Arbitrum Sepolia is
/// the strictest). Public RPCs vary widely. 10 is the safe lower bound;
/// the polling loop handles multi-chunk catch-up automatically.
const MAX_BLOCK_RANGE = 10n;
const POLL_INTERVAL_MS = 8_000;

/// Event signature must stay in sync with VistaGateway.sol's CampaignBridged.
const VISTA_GATEWAY_ABI = parseAbi([
  "event CampaignBridged(bytes32 indexed campaignId, address indexed advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, uint64 cctpNonce, uint32 sourceChainId, bytes32 solanaCampaignVault)",
]);

export interface BridgedCampaign {
  campaignId: `0x${string}`;
  advertiser: `0x${string}`;
  totalBudget: bigint;
  ratePerSecond: bigint;
  duration: bigint;
  cctpNonce: bigint;
  sourceChainId: number;
  solanaCampaignVault: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

/// Watches one EVM chain's `VistaGateway` contract for `CampaignBridged`
/// events. On each event:
///   1. POST to dashboard /api/oracle/sync (bridge_status -> 'evm_confirmed')
///   2. Submit `receive_campaign_metadata` to vista_bridge on Solana
///      (LayerZero stub — trusted relayer mode)
///   3. Hand off to CctpWatcher to poll Circle Iris for the attestation
export class EvmChainWatcher {
  private readonly client: PublicClient;
  private timer?: NodeJS.Timeout;
  private nextBlock: bigint = 0n;
  private retryDelayMs = 5_000;
  private stopped = false;

  constructor(
    private readonly cfg: OracleConfig,
    private readonly chain: EvmChainConfig,
    private readonly sync: SyncClient,
    private readonly cctp: CctpWatcher,
    private readonly onBridged: (
      chain: EvmChainConfig,
      campaign: BridgedCampaign,
    ) => Promise<void>,
  ) {
    this.client = createPublicClient({
      transport: http(chain.rpcUrl),
    });
  }

  async start(): Promise<void> {
    try {
      this.nextBlock = await this.client.getBlockNumber();
      console.log(
        `[evm-watcher:${this.chain.key}] watching VistaGateway ${this.chain.vistaGateway} from block ${this.nextBlock} (poll ${POLL_INTERVAL_MS}ms via eth_getLogs)`,
      );
    } catch (err) {
      console.warn(
        `[evm-watcher:${this.chain.key}] getBlockNumber failed, retrying:`,
        err,
      );
      setTimeout(() => {
        if (!this.stopped) this.start();
      }, this.retryDelayMs);
      return;
    }

    // Plain getLogs polling. Public RPCs like sepolia.base.org expire
    // eth_newFilter handles within ~5 minutes, which surfaces here as
    // "filter not found" (-32602) and breaks viem's watchContractEvent.
    // Polling getLogs by block range sidesteps filters entirely.
    const tick = async () => {
      if (this.stopped) return;
      try {
        await this.pollOnce();
      } catch (err) {
        console.warn(
          `[evm-watcher:${this.chain.key}] poll error, will retry:`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        if (!this.stopped) {
          this.timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };
    this.timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async pollOnce(): Promise<void> {
    const head = await this.client.getBlockNumber();
    if (head < this.nextBlock) return;

    let from = this.nextBlock;
    while (from <= head) {
      const to = from + MAX_BLOCK_RANGE - 1n > head ? head : from + MAX_BLOCK_RANGE - 1n;
      const logs = await this.client.getLogs({
        address: this.chain.vistaGateway,
        event: VISTA_GATEWAY_ABI[0],
        fromBlock: from,
        toBlock: to,
      });
      if (logs.length > 0) {
        await this.handleLogs(logs);
      }
      from = to + 1n;
    }
    this.nextBlock = head + 1n;
  }

  private async handleLogs(rawLogs: Log[]): Promise<void> {
    const parsed = parseEventLogs({
      abi: VISTA_GATEWAY_ABI,
      logs: rawLogs,
      eventName: "CampaignBridged",
    });

    for (const log of parsed) {
      const args = log.args;
      if (!args.campaignId || !args.advertiser) continue;

      const campaign: BridgedCampaign = {
        campaignId: args.campaignId,
        advertiser: args.advertiser,
        totalBudget: args.totalBudget!,
        ratePerSecond: args.ratePerSecond!,
        duration: args.duration!,
        cctpNonce: args.cctpNonce!,
        sourceChainId: Number(args.sourceChainId),
        solanaCampaignVault: args.solanaCampaignVault!,
        txHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
      };

      console.log(
        `[evm-watcher:${this.chain.key}] CampaignBridged campaign=${campaign.campaignId} budget=${campaign.totalBudget} cctpNonce=${campaign.cctpNonce} tx=${campaign.txHash}`,
      );

      // 1. Tell dashboard the EVM tx landed (bridge_status -> evm_confirmed).
      await this.sync.post({
        event: "cross_chain_evm_confirmed",
        payload: {
          campaign_id_onchain: campaign.campaignId,
          source_chain: this.chain.key,
          source_chain_tx_hash: campaign.txHash,
          cctp_nonce: campaign.cctpNonce.toString(),
          advertiser_evm_address: campaign.advertiser,
          total_budget_raw: campaign.totalBudget.toString(),
          observed_at: new Date().toISOString(),
        },
      });

      // 2. Hand off to the parent (which will submit the LayerZero-stub
      //    receive_campaign_metadata to vista_bridge), then enqueue CCTP.
      try {
        await this.onBridged(this.chain, campaign);
      } catch (err) {
        console.error(
          `[evm-watcher:${this.chain.key}] receive_campaign_metadata failed:`,
          err,
        );
        await this.sync.post({
          event: "cross_chain_failed",
          payload: {
            campaign_id_onchain: campaign.campaignId,
            stage: "lz_stub_relay",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        continue;
      }

      // 3. Hand off to the CCTP attestation poller.
      this.cctp.enqueue({
        campaignId: campaign.campaignId,
        sourceChain: this.chain,
        cctpNonce: campaign.cctpNonce,
        sourceTxHash: campaign.txHash,
        totalBudget: campaign.totalBudget,
      });
    }
  }
}

/// Spins up a watcher per configured chain.
export function startEvmWatchers(
  cfg: OracleConfig,
  sync: SyncClient,
  cctp: CctpWatcher,
  onBridged: (
    chain: EvmChainConfig,
    campaign: BridgedCampaign,
  ) => Promise<void>,
): EvmChainWatcher[] {
  if (!cfg.crossChain.enabled) {
    console.log(
      "[evm-watcher] cross-chain disabled (no VISTA_GATEWAY_* env set); skipping",
    );
    return [];
  }
  const watchers = cfg.crossChain.chains.map(
    (chain) => new EvmChainWatcher(cfg, chain, sync, cctp, onBridged),
  );
  for (const w of watchers) void w.start();
  return watchers;
}
