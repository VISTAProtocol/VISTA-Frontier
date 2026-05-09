import { getAddress, isAddress, verifyMessage } from "viem";
import { z } from "zod";

import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api";
import { deleteNonce, getNonceEntry } from "@/lib/nonce-store";
import { createServerSupabaseClient } from "@/lib/supabase";
import { DEFAULT_SECONDARY_WEIGHT } from "@/lib/identity";

const SUPPORTED_CHAINS = [
  "base-sepolia",
  "arbitrum-sepolia",
  "optimism-sepolia",
  "polygon-amoy",
  "monad-testnet",
] as const;

const schema = z.object({
  secondaryWallet: z.string().refine((v) => isAddress(v), "Invalid EVM address"),
  secondaryChain: z.enum(SUPPORTED_CHAINS),
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Invalid hex signature"),
});

/**
 * Verifies the EVM-side signature of a link challenge and persists the
 * (primary, secondary, chain) tuple. Three message bindings are required
 * (nonce, primary identity, secondary address) — `verifyMessage` only
 * proves the signer; the bindings prove the message is the one we issued.
 */
export async function POST(request: Request) {
  try {
    const primary = await assertJwt(request);
    const body = schema.parse(await request.json());
    const checksummed = getAddress(body.secondaryWallet);

    const key = `link:${primary}:${checksummed.toLowerCase()}`;
    const entry = getNonceEntry(key);
    if (!entry || entry.expires < Date.now()) {
      throw new ApiError("Challenge expired or not found.", 401);
    }
    if (!body.message.includes(`Nonce: ${entry.nonce}`)) {
      throw new ApiError("Message nonce mismatch.", 401);
    }
    if (!body.message.includes(primary)) {
      throw new ApiError("Message does not bind primary identity.", 401);
    }
    if (!body.message.includes(checksummed)) {
      throw new ApiError("Message does not bind secondary address.", 401);
    }

    const ok = await verifyMessage({
      address: checksummed,
      message: body.message,
      signature: body.signature as `0x${string}`,
    });
    if (!ok) throw new ApiError("Signature verification failed.", 401);

    deleteNonce(key);

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new ApiError("Supabase not configured.", 500);

    // Ensure a users row exists for the primary wallet (FK target).
    const { error: userError } = await supabase
      .from("users")
      .upsert({ wallet_address: primary }, { onConflict: "wallet_address" });
    if (userError) throw new ApiError(userError.message, 500);

    const { data, error } = await supabase
      .from("linked_wallets")
      .insert({
        primary_wallet: primary,
        secondary_wallet: checksummed,
        secondary_chain: body.secondaryChain,
        reputation_weight: DEFAULT_SECONDARY_WEIGHT,
        verification_message: body.message,
        verification_signature: body.signature,
      })
      .select()
      .single();

    if (error) {
      // Postgres unique_violation
      if ((error as { code?: string }).code === "23505") {
        throw new ApiError("This wallet is already linked.", 409);
      }
      throw new ApiError(error.message, 500);
    }

    return jsonOk(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}
