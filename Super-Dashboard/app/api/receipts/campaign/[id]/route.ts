import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api"
import { getReceiptsByCampaign } from "@/lib/data"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const callerWallet = await assertJwt(request)
    const { receipts, advertiserWallet } = await getReceiptsByCampaign(params.id)

    if (!advertiserWallet) {
      throw new ApiError("Campaign not found.", 404)
    }

    if (callerWallet !== advertiserWallet) {
      throw new ApiError("Forbidden.", 403)
    }

    return jsonOk(receipts)
  } catch (error) {
    return jsonError(error)
  }
}
