import { SignJWT } from "jose";
import { getAddress, isAddress, verifyMessage } from "viem";
import { z } from "zod";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { deleteNonce, getNonceEntry } from "@/lib/nonce-store";

const schema = z.object({
  address: z.string().refine((v) => isAddress(v), "Invalid EVM address"),
  message: z.string().min(1),
  /** 0x-prefixed personal_sign signature. */
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Invalid hex signature"),
});

/**
 * Sign-in verification for EVM wallets. Validates the EIP-191 signature via
 * viem's `verifyMessage` (handles EOA + EIP-1271 contract wallets) and
 * issues a JWT carrying { walletAddress, walletType: 'evm' }. The walletType
 * field lets downstream queries (e.g. selectCampaignsByWallet) decide
 * whether to filter by `advertiser_wallet` (Solana) or
 * `advertiser_evm_address` (EVM).
 */
export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());
    const checksummed = getAddress(parsed.address);

    const entry = getNonceEntry(`evm:${checksummed.toLowerCase()}`);
    if (!entry || entry.expires < Date.now()) {
      throw new ApiError(
        "Nonce expired or not found. Request a new challenge.",
        401,
      );
    }

    if (!parsed.message.includes(`Nonce: ${entry.nonce}`)) {
      throw new ApiError("Message does not embed the issued nonce.", 401);
    }
    if (!parsed.message.includes(checksummed)) {
      throw new ApiError("Message does not bind the signer address.", 401);
    }

    const ok = await verifyMessage({
      address: checksummed,
      message: parsed.message,
      signature: parsed.signature as `0x${string}`,
    });
    if (!ok) throw new ApiError("Signature verification failed.", 401);

    deleteNonce(`evm:${checksummed.toLowerCase()}`);

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new ApiError("JWT_SECRET not configured.", 500);

    const token = await new SignJWT({
      walletAddress: checksummed,
      walletType: "evm",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret));

    return jsonOk({ token, walletAddress: checksummed, walletType: "evm" });
  } catch (error) {
    return jsonError(error);
  }
}
