import { assertJwt, jsonError, jsonOk } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const walletAddress = await assertJwt(request)
    return jsonOk({ walletAddress })
  } catch (error) {
    return jsonError(error)
  }
}
