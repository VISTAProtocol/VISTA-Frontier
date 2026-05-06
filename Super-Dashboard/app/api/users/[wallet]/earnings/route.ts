import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api"
import { getUserEarnings } from "@/lib/data"

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  try {
    const callerWallet = await assertJwt(request)
    const wallet = params.wallet.toLowerCase()

    if (callerWallet !== wallet) {
      throw new ApiError("Forbidden.", 403)
    }

    const earnings = await getUserEarnings(wallet)
    return jsonOk(earnings)
  } catch (error) {
    return jsonError(error)
  }
}
