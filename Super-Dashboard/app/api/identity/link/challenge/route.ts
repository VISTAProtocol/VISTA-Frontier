import { randomBytes } from "node:crypto";

import { isAddress } from "viem";
import { z } from "zod";

import { assertJwt, jsonError, jsonOk } from "@/lib/api";
import { setNonce } from "@/lib/nonce-store";
import { EVM_CHAINS } from "@/lib/evm/chains";

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
});

/**
 * Issues a SIWE EIP-4361 challenge that the EVM wallet must sign to prove
 * ownership before being linked to the caller's primary Solana identity.
 *
 * The message embeds the primary Solana wallet (from JWT) so a signature
 * cannot be replayed across users.
 */
export async function POST(request: Request) {
  try {
    const primary = await assertJwt(request);
    const { secondaryWallet, secondaryChain } = schema.parse(
      await request.json(),
    );

    const nonce = randomBytes(16).toString("hex");
    const host = request.headers.get("host") ?? "localhost:3000";
    const origin = request.headers.get("origin") ?? `http://${host}`;
    const chainId = EVM_CHAINS[secondaryChain].chain.id;

    const message =
      `${host} wants you to sign in with your Ethereum account:\n` +
      `${secondaryWallet}\n\n` +
      `Link this wallet to VISTA primary identity ${primary}.\n\n` +
      `URI: ${origin}\n` +
      `Version: 1\n` +
      `Chain ID: ${chainId}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${new Date().toISOString()}`;

    setNonce(`link:${primary}:${secondaryWallet.toLowerCase()}`, nonce);

    return jsonOk({ message, nonce });
  } catch (error) {
    return jsonError(error);
  }
}
