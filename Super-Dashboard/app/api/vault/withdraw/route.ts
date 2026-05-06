import { z } from "zod"
import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { recordWithdrawal } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  amount: z.coerce.number().nonnegative(),
  withdrawnAt: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())

    // Normalize atoms to USDC units (6 decimals) — Ponder sends raw BigInt string
    parsed.amount = parsed.amount / 1_000_000

    const result = await recordWithdrawal(parsed)
    return jsonOk(result, 201)
  } catch (error) {
    return jsonError(error)
  }
}
