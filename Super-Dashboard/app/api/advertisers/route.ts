import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { createAdvertiser } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  companyName: z.string().min(2),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const advertiser = await createAdvertiser(parsed)
    return jsonOk(advertiser, 201)
  } catch (error) {
    return jsonError(error)
  }
}
