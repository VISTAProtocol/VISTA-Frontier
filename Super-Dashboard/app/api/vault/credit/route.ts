import { z } from "zod"
import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { creditVault } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  sessionIdOnchain: z.string().min(10),
  campaignIdOnchain: z.string().min(10),
  amount: z.coerce.number().nonnegative(),
  role: z.coerce.number().int(),
  creditedAt: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())

    // Normalize atoms to USDC units (6 decimals)
    parsed.amount = parsed.amount / 1_000_000

    const result = await creditVault(parsed)
    return jsonOk(result, 201)
  } catch (error) {
    return jsonError(error)
  }
}
