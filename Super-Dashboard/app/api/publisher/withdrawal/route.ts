import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { getVaultBalance, recordWithdrawal } from "@/lib/data"
import { normalizeWallet } from "@/lib/utils"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get("wallet")
    if (!wallet) return jsonError("Missing wallet parameter")

    const balance = await getVaultBalance(normalizeWallet(wallet))
    return jsonOk({ totalWithdrawn: balance.totalWithdrawn })
  } catch (error) {
    return jsonError(error)
  }
}

const schema = z.object({
  walletAddress: z.string().min(6),
  amount: z.number().positive(),
  withdrawnAt: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const record = await recordWithdrawal({
      walletAddress: parsed.walletAddress,
      amount: parsed.amount,
      withdrawnAt: parsed.withdrawnAt ?? new Date().toISOString(),
    })
    return jsonOk(record, 201)
  } catch (error) {
    return jsonError(error)
  }
}
