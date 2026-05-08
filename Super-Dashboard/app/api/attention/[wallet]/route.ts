import { jsonError, jsonOk } from "@/lib/api"
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
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const url = new URL(request.url)
    const chains = parseList(url.searchParams, "chain")
    const platforms = parseList(url.searchParams, "platform")
    const wallet = normalizeWallet((await params).wallet)

    const result = await getAttentionScore(wallet, {
      chains: chains.length ? chains : undefined,
      platforms: platforms.length ? platforms : undefined,
    })

    return jsonOk({
      wallet: result.wallet,
      score: result.score,
      updatedAt: result.updatedAt,
    })
  } catch (error) {
    return jsonError(error)
  }
}
