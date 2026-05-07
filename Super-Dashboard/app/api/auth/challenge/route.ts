import { randomBytes } from "node:crypto";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { setNonce } from "@/lib/nonce-store";

/**
 * Sign-in challenge for Solana wallets. Returns a plaintext message the user
 * signs with their wallet's ed25519 key; /api/auth/verify validates the
 * resulting signature.
 */
export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) throw new ApiError("Missing address parameter.", 400);

    const nonce = randomBytes(16).toString("hex");
    const host = request.headers.get("host") ?? "localhost:3000";
    const origin = request.headers.get("origin") ?? `http://${host}`;

    const message =
      `${host} wants you to sign in with your Solana account:\n` +
      `${address}\n\n` +
      `Sign in to VISTA Protocol.\n\n` +
      `URI: ${origin}\n` +
      `Version: 1\n` +
      `Chain: solana:devnet\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${new Date().toISOString()}`;

    setNonce(address, nonce);

    return jsonOk({ message, nonce });
  } catch (error) {
    return jsonError(error);
  }
}
