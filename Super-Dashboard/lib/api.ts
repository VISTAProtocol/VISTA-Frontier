import { jwtVerify } from "jose"
import { NextResponse } from "next/server"

export class ApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : "Unexpected error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export function assertOracleSecret(request: Request) {
  const expectedSecret = process.env.ORACLE_WEBHOOK_SECRET
  const providedSecret = request.headers.get("x-oracle-secret")

  if (!expectedSecret || providedSecret !== expectedSecret) {
    throw new ApiError("Unauthorized oracle webhook.", 401)
  }
}

export async function assertJwt(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) throw new ApiError("Missing authorization token.", 401)

  const secret = process.env.JWT_SECRET
  if (!secret) throw new ApiError("JWT_SECRET not configured.", 500)

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    const walletAddress = payload.walletAddress as string | undefined
    if (!walletAddress) throw new ApiError("Invalid token payload.", 401)
    return walletAddress
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("Invalid or expired token.", 401)
  }
}
