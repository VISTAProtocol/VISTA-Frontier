import { ApiError, assertOracleSecret, jsonError, jsonOk } from "@/lib/api"
import { verifyPublisherApiKey } from "@/lib/data"

export async function GET(request: Request) {
  try {
    assertOracleSecret(request)
    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get("apiKey")

    if (!apiKey) throw new ApiError("Missing apiKey parameter.", 400)

    const result = await verifyPublisherApiKey(apiKey)
    if (!result) throw new ApiError("API key not found.", 404)

    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
