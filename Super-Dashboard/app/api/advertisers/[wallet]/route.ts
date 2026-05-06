import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { getAdvertiserByWallet } from "@/lib/data"

export async function GET(
  _request: Request,
  { params }: { params: { wallet: string } }
) {
  try {
    const advertiser = await getAdvertiserByWallet(params.wallet)
    if (!advertiser) throw new ApiError("Advertiser not found.", 404)
    return jsonOk(advertiser)
  } catch (error) {
    return jsonError(error)
  }
}
