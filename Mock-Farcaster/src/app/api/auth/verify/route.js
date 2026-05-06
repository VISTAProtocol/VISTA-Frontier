import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { consumeNonce } from "@/lib/auth/nonce-store";
import { setSessionCookie } from "@/lib/auth/session";

function isIncluded(message, field, value) {
  return message.includes(`${field}: ${value}`);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const signature = typeof body?.signature === "string" ? body.signature : "";
    const nonce = typeof body?.nonce === "string" ? body.nonce : "";
    const chainId = Number.parseInt(body?.chainId ?? "", 10);
    const message = typeof body?.message === "string" ? body.message : "";

    if (!address || !signature || !nonce || !message || !Number.isFinite(chainId)) {
      return NextResponse.json({ error: "Invalid authentication payload." }, { status: 400 });
    }

    if (!consumeNonce(nonce, address)) {
      return NextResponse.json({ error: "Nonce is invalid or expired." }, { status: 401 });
    }

    if (!isIncluded(message, "Address", address) || !isIncluded(message, "Nonce", nonce)) {
      return NextResponse.json({ error: "Signed message content mismatch." }, { status: 401 });
    }

    const isValidSignature = await verifyMessage({
      address,
      message,
      signature,
    });

    if (!isValidSignature) {
      return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
    }

    await setSessionCookie({ address, chainId });

    return NextResponse.json({
      ok: true,
      user: {
        address: address.toLowerCase(),
        chainId,
      },
    });
  } catch {
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
