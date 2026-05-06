import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { getRegistrationStatus } from "@/lib/data"
import type { RoleName } from "@/lib/types"

const querySchema = z.object({
  role: z.enum(["advertiser", "publisher", "user"]),
  wallet: z.string().min(6),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.parse({
      role: searchParams.get("role"),
      wallet: searchParams.get("wallet"),
    })

    const status = await getRegistrationStatus(parsed.role as RoleName, parsed.wallet)
    return jsonOk(status)
  } catch (error) {
    return jsonError(error)
  }
}
