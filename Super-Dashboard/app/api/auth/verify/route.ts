import { SignJWT } from "jose"
import { SiweMessage } from "siwe"
import { z } from "zod"
import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { deleteNonce, getNonceEntry } from "@/lib/nonce-store"

const schema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const siwe = new SiweMessage(parsed.message)
    const address = siwe.address.toLowerCase()

    const entry = getNonceEntry(address)
    if (!entry || entry.expires < Date.now()) {
      throw new ApiError("Nonce expired or not found. Request a new challenge.", 401)
    }

    const result = await siwe.verify(
      { signature: parsed.signature, nonce: entry.nonce },
      { suppressExceptions: true }
    )

    if (!result.success) {
      throw new ApiError("Signature verification failed.", 401)
    }

    deleteNonce(address)

    const secret = process.env.JWT_SECRET
    if (!secret) throw new ApiError("JWT_SECRET not configured.", 500)

    const token = await new SignJWT({ walletAddress: address })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret))

    return jsonOk({ token, walletAddress: address })
  } catch (error) {
    return jsonError(error)
  }
}
