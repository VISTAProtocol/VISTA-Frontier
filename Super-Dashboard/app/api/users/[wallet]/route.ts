import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { getUser } from "@/lib/data"

export async function GET(
  _request: Request,
  { params }: { params: { wallet: string } }
) {
  try {
    const user = await getUser(params.wallet)

    if (!user) {
      throw new ApiError("User not found.", 404)
    }

    return jsonOk(user)
  } catch (error) {
    return jsonError(error)
  }
}
