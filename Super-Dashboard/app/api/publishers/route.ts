import { z } from "zod"

import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { createPublisher, getPublishersByWallet } from "@/lib/data"

const schema = z.object({
  walletAddress: z.string().min(6),
  platformName: z.string().min(2),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get("wallet")
    if (!wallet) return jsonOk([])
    return jsonOk(await getPublishersByWallet(wallet))
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const publisher = await createPublisher(parsed)
    return jsonOk(publisher, 201)
  } catch (error) {
    return jsonError(error)
  }
}
