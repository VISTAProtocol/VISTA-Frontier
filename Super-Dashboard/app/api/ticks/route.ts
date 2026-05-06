import { z } from "zod"

import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { recordTick } from "@/lib/data"

const schema = z.object({
  sessionIdOnchain: z.string().min(10),
  userWallet: z.string().min(6),
  publisherWallet: z.string().min(6),
  userAmount: z.coerce.number().nonnegative(),
  publisherAmount: z.coerce.number().nonnegative(),
  totalAmount: z.coerce.number().nonnegative(),
  secondsElapsed: z.coerce.number().int().positive(),
  blockTimestamp: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())

    // Normalize atoms to USDC units (6 decimals)
    parsed.userAmount = parsed.userAmount / 1_000_000
    parsed.publisherAmount = parsed.publisherAmount / 1_000_000
    parsed.totalAmount = parsed.totalAmount / 1_000_000

    const tick = await recordTick(parsed)
    return jsonOk(tick, 201)
  } catch (error) {
    return jsonError(error)
  }
}
