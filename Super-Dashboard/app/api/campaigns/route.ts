import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/api"
import { preferenceOptions } from "@/lib/constants"
import { createCampaign, listCampaignsByAdvertiser } from "@/lib/data"

const campaignSchema = z.object({
  campaignIdOnchain: z.string().min(10),
  advertiserWallet: z.string().min(6),
  title: z.string().min(2),
  creativeUrl: z.string().url(),
  targetUrl: z.string().url(),
  totalBudget: z.number().positive(),
  ratePerSecond: z.number().positive(),
  targetPreferences: z.array(z.enum(preferenceOptions)).default([]),
  targetMinAge: z.number().int().nullable().optional(),
  targetMaxAge: z.number().int().nullable().optional(),
  targetLocations: z.array(z.string()).default([]),
  chain: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const advertiserWallet = searchParams.get("advertiserWallet")

    if (!advertiserWallet) {
      return jsonOk([])
    }

    return jsonOk(await listCampaignsByAdvertiser(advertiserWallet))
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const parsed = campaignSchema.parse(await request.json())

    const campaign = await createCampaign({
      campaignIdOnchain: parsed.campaignIdOnchain,
      advertiserWallet: parsed.advertiserWallet,
      title: parsed.title,
      creativeUrl: parsed.creativeUrl,
      targetUrl: parsed.targetUrl,
      totalBudget: parsed.totalBudget,
      ratePerSecond: parsed.ratePerSecond,
      targetPreferences: parsed.targetPreferences,
      targetMinAge: parsed.targetMinAge ?? null,
      targetMaxAge: parsed.targetMaxAge ?? null,
      targetLocations: parsed.targetLocations,
      chain: parsed.chain,
    })

    return jsonOk(campaign, 201)
  } catch (error) {
    return jsonError(error)
  }
}
