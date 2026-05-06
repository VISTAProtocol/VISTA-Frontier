import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { preferenceOptions } from "@/lib/constants"
import { createUser } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  age: z.number().int().min(13).max(120).nullable().optional(),
  location: z.string().trim().nullable().optional(),
  preferences: z.array(z.enum(preferenceOptions)).default([]),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const user = await createUser({
      walletAddress: parsed.walletAddress,
      age: parsed.age ?? null,
      location: parsed.location ?? null,
      preferences: parsed.preferences,
    })

    return jsonOk(user, 201)
  } catch (error) {
    return jsonError(error)
  }
}
