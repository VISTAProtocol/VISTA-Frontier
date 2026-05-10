import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { preferenceOptions } from "@/lib/constants";
import {
  createCampaign,
  updateCampaignBridgeStatus,
} from "@/lib/data";

const sourceChainEnum = z.enum([
  "base-sepolia",
  "arbitrum-sepolia",
  "optimism-sepolia",
  "polygon-amoy",
  "monad-testnet",
]);

/// POST creates the campaign row immediately (before the EVM tx is signed),
/// so the row survives a tab close. Status starts at 'initiated'; the oracle
/// node's evmWatcher upgrades it to 'evm_confirmed' once the burn lands.
///
/// `advertiserWallet` is optional — pure EVM advertisers (no Solana wallet)
/// pass only `advertiserEvmAddress`. We mirror the EVM addr into
/// `advertiserWallet` for backward-compat with downstream queries.
const initiatedSchema = z.object({
  campaignIdOnchain: z.string().min(10),
  advertiserWallet: z.string().min(6).optional(),
  advertiserEvmAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sourceChain: sourceChainEnum,
  title: z.string().min(2),
  creativeUrl: z.string().url(),
  targetUrl: z.string().url(),
  totalBudget: z.number().positive(),
  ratePerSecond: z.number().positive(),
  targetPreferences: z.array(z.enum(preferenceOptions)).default([]),
  targetMinAge: z.number().int().nullable().optional(),
  targetMaxAge: z.number().int().nullable().optional(),
  targetLocations: z.array(z.string()).default([]),
});

/// PATCH updates the row with the EVM tx hash + CCTP nonce once the user
/// signs the deposit transaction. Auth: dashboard session is enough — the
/// campaign id is unguessable so this isn't a secret-bearing endpoint.
const patchSchema = z.object({
  campaignIdOnchain: z.string().min(10),
  sourceChainTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  cctpNonce: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = initiatedSchema.parse(await request.json());

    const campaign = await createCampaign({
      campaignIdOnchain: parsed.campaignIdOnchain,
      advertiserWallet:
        parsed.advertiserWallet ?? parsed.advertiserEvmAddress.toLowerCase(),
      title: parsed.title,
      creativeUrl: parsed.creativeUrl,
      targetUrl: parsed.targetUrl,
      totalBudget: parsed.totalBudget,
      ratePerSecond: parsed.ratePerSecond,
      targetPreferences: parsed.targetPreferences,
      targetMinAge: parsed.targetMinAge ?? null,
      targetMaxAge: parsed.targetMaxAge ?? null,
      targetLocations: parsed.targetLocations,
      chain: parsed.sourceChain,
      sourceChain: parsed.sourceChain,
      advertiserEvmAddress: parsed.advertiserEvmAddress.toLowerCase(),
      bridgeStatus: "initiated",
    });

    return jsonOk(campaign, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.parse(await request.json());
    const updated = await updateCampaignBridgeStatus(parsed.campaignIdOnchain, {
      source_chain_tx_hash: parsed.sourceChainTxHash,
      cctp_nonce: parsed.cctpNonce ?? null,
    });
    if (!updated) {
      return jsonError(new Error("campaign not found"));
    }
    return jsonOk(updated);
  } catch (error) {
    return jsonError(error);
  }
}
