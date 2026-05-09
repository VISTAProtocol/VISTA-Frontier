import { z } from "zod";

import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api";
import { applyOracleSyncEvent, type SyncEvent } from "@/lib/oracle-data";

const eventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("registered"),
    payload: z.object({
      oracle: z.string(),
      endpoint_url: z.string(),
      stake_amount: z.coerce.number().nonnegative(),
      registered_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("unregistered"),
    payload: z.object({
      oracle: z.string(),
      unregistered_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("slashed"),
    payload: z.object({
      oracle: z.string(),
      amount: z.coerce.number().nonnegative(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    event: z.literal("reward_credited"),
    payload: z.object({
      oracle: z.string(),
      amount: z.coerce.number().nonnegative(),
      session_id_onchain: z.string(),
      was_outlier: z.boolean().optional(),
    }),
  }),
  z.object({
    event: z.literal("rewards_claimed"),
    payload: z.object({
      oracle: z.string(),
      amount: z.coerce.number().nonnegative(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    event: z.literal("submission"),
    payload: z.object({
      oracle: z.string(),
      session_id_onchain: z.string(),
      score: z.coerce.number().int().min(0).max(100),
      signals: z.record(z.unknown()).optional(),
      submitted_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("session_aggregated"),
    payload: z.object({
      session_id_onchain: z.string(),
      consensus_score: z.coerce.number().int().min(0).max(100),
      outliers: z.array(z.string()),
      honest: z.array(z.string()),
      per_oracle_reward: z.coerce.number().nonnegative(),
      settled_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("cross_chain_evm_confirmed"),
    payload: z.object({
      campaign_id_onchain: z.string(),
      source_chain: z.enum(["base-sepolia", "arbitrum-sepolia"]),
      source_chain_tx_hash: z.string(),
      cctp_nonce: z.string(),
      advertiser_evm_address: z.string(),
      total_budget_raw: z.string(),
      observed_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("cross_chain_attested"),
    payload: z.object({
      campaign_id_onchain: z.string(),
      cctp_nonce: z.string(),
      observed_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("cross_chain_active"),
    payload: z.object({
      campaign_id_onchain: z.string(),
      confirm_tx: z.string().optional(),
      activated_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("cross_chain_failed"),
    payload: z.object({
      campaign_id_onchain: z.string(),
      stage: z.string(),
      error: z.string(),
    }),
  }),
  z.object({
    event: z.literal("campaign_created"),
    payload: z.object({
      campaign_id_onchain: z.string(),
      advertiser_wallet: z.string(),
      total_budget: z.string(),
      rate_per_second: z.string(),
      block_slot: z.coerce.number(),
    }),
  }),
  z.object({
    event: z.literal("stream_started"),
    payload: z.object({
      session_id_onchain: z.string(),
      campaign_id_onchain: z.string(),
      user_wallet: z.string(),
      publisher_wallet: z.string(),
      started_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("stream_tick"),
    payload: z.object({
      session_id_onchain: z.string(),
      user_wallet: z.string(),
      publisher_wallet: z.string(),
      total_amount: z.string(),
      user_amount: z.string(),
      publisher_amount: z.string(),
      validator_amount: z.string(),
      vista_amount: z.string(),
      block_timestamp: z.string(),
    }),
  }),
  z.object({
    event: z.literal("stream_ended"),
    payload: z.object({
      session_id_onchain: z.string(),
      seconds_verified: z.coerce.number(),
      total_paid: z.string(),
      ended_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("receipt_minted"),
    payload: z.object({
      token_id: z.string(),
      session_id_onchain: z.string(),
      campaign_id_onchain: z.string(),
      user_wallet: z.string(),
      seconds_verified: z.coerce.number(),
      usdc_paid: z.string(),
      minted_at: z.string(),
    }),
  }),
  z.object({
    event: z.literal("withdrawn"),
    payload: z.object({
      wallet: z.string(),
      amount: z.string(),
      withdrawn_at: z.string(),
    }),
  }),
]);

export async function POST(request: Request) {
  try {
    assertOracleSecret(request);
    const parsed = eventSchema.parse(await request.json());
    await applyOracleSyncEvent(parsed as SyncEvent);
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
