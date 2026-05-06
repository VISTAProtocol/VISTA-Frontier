import { z } from "zod"

import { ApiError, jsonError, jsonOk } from "@/lib/api"
import {
  getAdvertiserDashboard,
  getPublisherDashboard,
  getUserDashboard,
} from "@/lib/data"
import type { RoleName } from "@/lib/types"

const querySchema = z.object({
  wallet: z.string().min(6),
})

export async function GET(
  request: Request,
  { params }: { params: { role: string } }
) {
  try {
    const role = params.role as RoleName
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.parse({
      wallet: searchParams.get("wallet"),
    })

    if (role === "advertiser") {
      return jsonOk(await getAdvertiserDashboard(parsed.wallet))
    }

    if (role === "publisher") {
      return jsonOk(await getPublisherDashboard(parsed.wallet))
    }

    if (role === "user") {
      return jsonOk(await getUserDashboard(parsed.wallet))
    }

    throw new ApiError("Unsupported dashboard role.", 404)
  } catch (error) {
    return jsonError(error)
  }
}
