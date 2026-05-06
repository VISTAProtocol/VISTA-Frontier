import { z } from "zod"

import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { getCampaignDetail, updateCampaignById } from "@/lib/data"

const patchSchema = z.object({
  active: z.boolean().optional(),
  remaining_budget: z.number().nonnegative().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await getCampaignDetail(params.id)
    if (!campaign) {
      throw new ApiError("Campaign not found.", 404)
    }

    return jsonOk(campaign)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const parsed = patchSchema.parse(await request.json())
    const campaign = await updateCampaignById(params.id, parsed)

    if (!campaign) {
      throw new ApiError("Campaign not found.", 404)
    }

    return jsonOk(campaign)
  } catch (error) {
    return jsonError(error)
  }
}
