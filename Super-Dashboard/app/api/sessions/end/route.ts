import { z } from "zod"
import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { endSession } from "@/lib/data"

const schema = z.object({
  sessionIdOnchain: z.string().min(10),
  secondsVerified: z.coerce.number().int().nonnegative(),
  totalPaid: z.coerce.number().nonnegative(),
  endedAt: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())

    // Normalize atoms to USDC units (6 decimals)
    parsed.totalPaid = parsed.totalPaid / 1_000_000

    const result = await endSession(parsed)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
