import { z } from "zod"
import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { endCampaign } from "@/lib/data"

const schema = z.object({
  campaignIdOnchain: z.string().min(10),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())
    const result = await endCampaign(parsed.campaignIdOnchain)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
