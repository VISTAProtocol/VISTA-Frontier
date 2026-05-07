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
  private unwatch?: () => void;
  private fromBlock?: bigint;
  private retryDelayMs = 5_000;

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
      this.fromBlock = await this.client.getBlockNumber();
      console.log(
        `[evm-watcher:${this.chain.key}] watching VistaGateway ${this.chain.vistaGateway} from block ${this.fromBlock}`,
      );
    } catch (err) {
      console.warn(
        `[evm-watcher:${this.chain.key}] getBlockNumber failed, retrying:`,
        err,
      );
      setTimeout(() => this.start(), this.retryDelayMs);
      return;
    }

    this.unwatch = this.client.watchContractEvent({
      address: this.chain.vistaGateway,
      abi: VISTA_GATEWAY_ABI,
      eventName: "CampaignBridged",
      onLogs: (logs) => this.handleLogs(logs).catch((err) => {
        console.error(`[evm-watcher:${this.chain.key}] handleLogs error:`, err);
      }),
      onError: (err) => {
        console.warn(
          `[evm-watcher:${this.chain.key}] watch error, will reconnect:`,
          err,
        );
      },
    });
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = undefined;
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
