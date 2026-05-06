import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { getActiveCampaignsForUser } from "@/lib/data"

const querySchema = z.object({
  userWallet: z.string().min(6),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.parse({
      userWallet: searchParams.get("userWallet"),
    })

    return jsonOk(await getActiveCampaignsForUser(parsed.userWallet))
  } catch (error) {
    return jsonError(error)
  }
}
