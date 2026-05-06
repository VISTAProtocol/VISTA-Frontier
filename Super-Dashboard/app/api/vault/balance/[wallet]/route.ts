import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api"
import { getVaultBalance } from "@/lib/data"

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

    const balance = await getVaultBalance(wallet)
    return jsonOk(balance)
  } catch (error) {
    return jsonError(error)
  }
}
