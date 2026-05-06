import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api"
import { getAttentionScore } from "@/lib/data"
import { normalizeWallet } from "@/lib/utils"

function parseList(
  params: URLSearchParams,
  key: string,
): string[] {
  const values = params.getAll(key)
  const combined = values.flatMap((value) => value.split(","))
  return combined.map((value) => value.trim()).filter(Boolean)
}

export async function GET(
  request: Request,
  { params }: { params: { wallet: string } }
) {
  try {
    const callerWallet = normalizeWallet(await assertJwt(request))
    const wallet = normalizeWallet(params.wallet)

    if (callerWallet !== wallet) {
      throw new ApiError("Forbidden.", 403)
    }

    const url = new URL(request.url)
    const chains = parseList(url.searchParams, "chain")
    const platforms = parseList(url.searchParams, "platform")

    const result = await getAttentionScore(wallet, {
      chains: chains.length ? chains : undefined,
      platforms: platforms.length ? platforms : undefined,
    })

    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
