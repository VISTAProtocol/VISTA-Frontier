import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { getUserHistory } from "@/lib/data"

const querySchema = z.object({
  wallet: z.string().min(6),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.parse({
      wallet: searchParams.get("wallet"),
    })

    return jsonOk(await getUserHistory(parsed.wallet))
  } catch (error) {
    return jsonError(error)
  }
}
