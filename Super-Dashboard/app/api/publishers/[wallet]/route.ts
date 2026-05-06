import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { getPublisherByWallet } from "@/lib/data"

export async function GET(
  _request: Request,
  { params }: { params: { wallet: string } }
) {
  try {
    const publisher = await getPublisherByWallet(params.wallet)
    if (!publisher) throw new ApiError("Publisher not found.", 404)
    return jsonOk(publisher)
  } catch (error) {
    return jsonError(error)
  }
}
