import { z } from "zod"

import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { createReceipt } from "@/lib/data"

const schema = z.object({
  tokenId: z.string().min(1).optional(),
  sessionIdOnchain: z.string().min(10),
  userWallet: z.string().min(6),
  publisherWallet: z.string().min(6).optional(),
  advertiserWallet: z.string().min(6).optional(),
  campaignIdOnchain: z.string().min(10),
  secondsVerified: z.coerce.number().int().nonnegative(),
  usdcPaid: z.coerce.number().nonnegative(),
  mintedAt: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const body = await request.json()

    // Support 'totalPaid' as an alias for 'usdcPaid' (used by Oracle Server)
    if (body.totalPaid !== undefined && body.usdcPaid === undefined) {
      body.usdcPaid = body.totalPaid
    }

    const parsed = schema.parse(body)

    // Normalize atoms to USDC units (6 decimals)
    parsed.usdcPaid = parsed.usdcPaid / 1_000_000

    const receipt = await createReceipt(parsed)
    return jsonOk(receipt, 201)
  } catch (error) {
    return jsonError(error)
  }
}
