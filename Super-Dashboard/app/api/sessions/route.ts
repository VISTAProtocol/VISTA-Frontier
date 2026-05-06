import { z } from "zod"

import { assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { createSession } from "@/lib/data"

const schema = z.object({
  sessionIdOnchain: z.string().min(10),
  campaignIdOnchain: z.string().min(10),
  userWallet: z.string().min(6),
  publisherWallet: z.string().min(6),
  startedAt: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    assertOracleSecret(request)
    const parsed = schema.parse(await request.json())
    const session = await createSession(parsed)
    return jsonOk(session, 201)
  } catch (error) {
    return jsonError(error)
  }
}
