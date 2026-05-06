import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api"
import { getReceiptsByUser } from "@/lib/data"

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

    const receipts = await getReceiptsByUser(wallet)
    return jsonOk(receipts)
  } catch (error) {
    return jsonError(error)
  }
}
