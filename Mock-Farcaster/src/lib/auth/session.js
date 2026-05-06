import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function encodeSessionPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSessionPayload(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function createSessionToken({ address, chainId }) {
  const issuedAt = nowSeconds();

  return encodeSessionPayload({
    address: address.toLowerCase(),
    chainId,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    iat: issuedAt,
  });
}

export async function verifySessionToken(token) {
  if (!token) {
    return null;
  }

  const payload = decodeSessionPayload(token);

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.address !== "string" || !payload.address) {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds()) {
    return null;
  }

  return {
    address: payload.address,
    chainId: typeof payload.chainId === "number" ? payload.chainId : null,
    exp: payload.exp,
    iat: typeof payload.iat === "number" ? payload.iat : null,
  };
}

export async function setSessionCookie({ address, chainId }) {
  const token = await createSessionToken({ address, chainId });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return await verifySessionToken(token);
}
