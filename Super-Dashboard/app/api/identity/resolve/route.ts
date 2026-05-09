import { PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * Public resolver: maps an arbitrary connected wallet (Solana or EVM) to the
 * Solana primary identity that should receive settlement.
 *
 * - If `wallet` is a valid Solana base58 pubkey → it IS the primary; return as-is.
 * - If `wallet` is a 0x EVM address → look up `linked_wallets` for the
 *   corresponding `primary_wallet`. Returns null if no link exists.
 *
 * Read-only and no PII; safe to leave unauthenticated. Called by oracle-node
 * before submitting `start_stream`, and by publisher SDKs / Mock-Farcaster
 * for UI hints ("settling to Solana primary X").
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wallet = url.searchParams.get("wallet");
    if (!wallet) throw new ApiError("Missing wallet parameter.", 400);

    // Try Solana first — if it parses as a valid pubkey, it's already primary.
    if (looksLikeSolanaPubkey(wallet)) {
      return jsonOk({
        primaryWallet: wallet,
        isPrimary: true,
        sourceChain: "solana-devnet",
      });
    }

    if (!isAddress(wallet)) {
      throw new ApiError(
        "Wallet is neither a valid Solana pubkey nor an EVM address.",
        400,
      );
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new ApiError("Supabase not configured.", 500);

    // Address comparison is case-insensitive in EVM; index uses lower(...).
    const { data, error } = await supabase
      .from("linked_wallets")
      .select("primary_wallet, secondary_chain, reputation_weight, linked_at")
      .ilike("secondary_wallet", wallet)
      .order("linked_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiError(error.message, 500);

    if (!data) {
      return jsonOk({
        primaryWallet: null,
        isPrimary: false,
        sourceChain: null,
        message:
          "EVM wallet not linked. Visit /user/identity on the dashboard to link it to a Solana primary.",
      });
    }

    return jsonOk({
      primaryWallet: data.primary_wallet,
      isPrimary: false,
      sourceChain: data.secondary_chain,
      reputationWeight: data.reputation_weight,
    });
  } catch (error) {
    return jsonError(error);
  }
}

function looksLikeSolanaPubkey(s: string): boolean {
  if (s.startsWith("0x")) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}
