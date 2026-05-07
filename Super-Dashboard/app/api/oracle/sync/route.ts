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
