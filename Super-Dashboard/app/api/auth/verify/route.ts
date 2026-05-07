import { SignJWT } from "jose";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { z } from "zod";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { deleteNonce, getNonceEntry } from "@/lib/nonce-store";

const schema = z.object({
  address: z.string().min(32),
  message: z.string().min(1),
  /** base58-encoded ed25519 signature (64 bytes). */
  signature: z.string().min(1),
});

/**
 * Sign-in verification for Solana wallets. Expects:
 *   - `address`: base58 wallet pubkey
 *   - `message`: the exact challenge string returned by /api/auth/challenge
 *   - `signature`: base58 ed25519 signature over the UTF-8 message bytes
 *
 * On success returns a JWT identifying `walletAddress`.
 */
export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());

    const entry = getNonceEntry(parsed.address);
    if (!entry || entry.expires < Date.now()) {
      throw new ApiError(
        "Nonce expired or not found. Request a new challenge.",
        401,
      );
    }

    if (!parsed.message.includes(`Nonce: ${entry.nonce}`)) {
      throw new ApiError("Message does not embed the issued nonce.", 401);
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(parsed.address);
    } catch {
      throw new ApiError("Invalid base58 wallet address.", 400);
    }

    const messageBytes = new TextEncoder().encode(parsed.message);
    const sigBytes = bs58.decode(parsed.signature);
    const ok = nacl.sign.detached.verify(
      messageBytes,
      sigBytes,
      pubkey.toBytes(),
    );
    if (!ok) {
      throw new ApiError("Signature verification failed.", 401);
    }

    deleteNonce(parsed.address);

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new ApiError("JWT_SECRET not configured.", 500);

    const token = await new SignJWT({ walletAddress: parsed.address })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret));

    return jsonOk({ token, walletAddress: parsed.address });
  } catch (error) {
    return jsonError(error);
  }
}
