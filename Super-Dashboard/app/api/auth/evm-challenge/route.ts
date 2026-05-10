import { randomBytes } from "node:crypto";

import { isAddress } from "viem";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { setNonce } from "@/lib/nonce-store";

/**
 * Sign-in challenge for EVM wallets (advertiser flow). Returns a SIWE
 * EIP-4361 plain-text message that the user signs in MetaMask. The matching
 * /api/auth/evm-verify endpoint validates the resulting personal_sign and
 * issues a JWT.
 *
 * Lets advertisers who only hold an EVM wallet (no Solana) onboard and
 * deposit campaigns directly via VistaGateway on Base/Arb/Optimism/Polygon.
 */
export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address) throw new ApiError("Missing address parameter.", 400);
    if (!isAddress(address)) throw new ApiError("Invalid EVM address.", 400);

    const nonce = randomBytes(16).toString("hex");
    const host = request.headers.get("host") ?? "localhost:3000";
    const origin = request.headers.get("origin") ?? `http://${host}`;

    const message =
      `${host} wants you to sign in with your Ethereum account:\n` +
      `${address}\n\n` +
      `Sign in to VISTA Protocol as an advertiser.\n\n` +
      `URI: ${origin}\n` +
      `Version: 1\n` +
      `Chain ID: 0\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${new Date().toISOString()}`;

    // Namespace nonce key with `evm:` prefix so it doesn't collide with the
    // Solana SIWS nonce store (which uses raw wallet addresses as keys).
    setNonce(`evm:${address.toLowerCase()}`, nonce);

    return jsonOk({ message, nonce });
  } catch (error) {
    return jsonError(error);
  }
}
