import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth/nonce-store";

export async function POST(request) {
  try {
    const body = await request.json();
    const address = typeof body?.address === "string" ? body.address : "";

    if (!address) {
      return NextResponse.json({ error: "Wallet address is required." }, { status: 400 });
    }

    const { nonce, expiresAt } = issueNonce(address);
    return NextResponse.json({ nonce, expiresAt });
  } catch {
    return NextResponse.json({ error: "Failed to issue nonce." }, { status: 400 });
  }
}
