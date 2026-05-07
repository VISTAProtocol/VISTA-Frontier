import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { consumeNonce } from "@/lib/auth/nonce-store";
import { setSessionCookie } from "@/lib/auth/session";

function isIncluded(message, field, value) {
  return message.includes(`${field}: ${value}`);
}

/**
 * Solana SIWS verification. Expects:
 *   - address: base58 wallet pubkey
 *   - message: exact challenge string returned by /api/auth/nonce + sign-message
 *   - signature: base58 ed25519 signature over the UTF-8 message bytes
 *   - nonce: the nonce embedded in the message
 */
export async function POST(request) {
  try {
    const body = await request.json();

    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const signature = typeof body?.signature === "string" ? body.signature : "";
    const nonce = typeof body?.nonce === "string" ? body.nonce : "";
    const message = typeof body?.message === "string" ? body.message : "";

    if (!address || !signature || !nonce || !message) {
      return NextResponse.json({ error: "Invalid authentication payload." }, { status: 400 });
    }

    if (!consumeNonce(nonce, address)) {
      return NextResponse.json({ error: "Nonce is invalid or expired." }, { status: 401 });
    }

    if (!isIncluded(message, "Address", address) || !isIncluded(message, "Nonce", nonce)) {
      return NextResponse.json({ error: "Signed message content mismatch." }, { status: 401 });
    }

    let pubkey;
    try {
      pubkey = new PublicKey(address);
    } catch {
      return NextResponse.json({ error: "Invalid base58 wallet address." }, { status: 400 });
    }

    let sigBytes;
    try {
      sigBytes = bs58.decode(signature);
    } catch {
      return NextResponse.json({ error: "Invalid base58 signature." }, { status: 400 });
    }

    const messageBytes = new TextEncoder().encode(message);
    const isValidSignature = nacl.sign.detached.verify(
      messageBytes,
      sigBytes,
      pubkey.toBytes(),
    );

    if (!isValidSignature) {
      return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
    }

    await setSessionCookie({ address });

    return NextResponse.json({
      ok: true,
      user: { address },
    });
  } catch {
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
