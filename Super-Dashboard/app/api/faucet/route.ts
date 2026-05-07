import { NextResponse } from "next/server";

/**
 * Deprecated EVM mock-USDC faucet (Base Sepolia). The protocol now runs on
 * Solana — to fund a wallet with devnet USDC, point users to
 * https://faucet.circle.com (Solana, devnet). This endpoint is preserved
 * to avoid 404s from clients that still ping it.
 */
export async function POST(_req: Request) {
  return NextResponse.json(
    {
      error:
        "EVM faucet is deprecated. Use https://faucet.circle.com (Solana devnet) " +
        "or the on-chain mint admin to top up devnet USDC.",
    },
    { status: 410 },
  );
}
