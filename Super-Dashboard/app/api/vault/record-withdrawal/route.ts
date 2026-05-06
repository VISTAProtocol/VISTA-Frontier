import { z } from "zod"
import { jsonError, jsonOk } from "@/lib/api"
import { recordWithdrawal } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  amount: z.coerce.number().nonnegative(),
  withdrawnAt: z.string().min(10),
})

// Called from the frontend after on-chain withdrawal is confirmed.
// Amount must already be in USDC units (not base units).
export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const result = await recordWithdrawal(parsed)
    return jsonOk(result, 201)
  } catch (error) {
    return jsonError(error)
  }
}
