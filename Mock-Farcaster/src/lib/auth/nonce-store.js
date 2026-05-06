import crypto from "node:crypto";
import { NONCE_TTL_MS } from "@/lib/auth/constants";

const nonceStore = new Map();

function normalizeAddress(address) {
  return typeof address === "string" ? address.trim().toLowerCase() : "";
}

function cleanupExpiredNonces() {
  const now = Date.now();

  for (const [nonce, record] of nonceStore.entries()) {
    if (record.expiresAt <= now) {
      nonceStore.delete(nonce);
    }
  }
}

export function issueNonce(address) {
  cleanupExpiredNonces();

  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + NONCE_TTL_MS;

  nonceStore.set(nonce, {
    address: normalizeAddress(address),
    expiresAt,
  });

  return { nonce, expiresAt };
}

export function consumeNonce(nonce, address) {
  if (!nonce || typeof nonce !== "string") {
    return false;
  }

  cleanupExpiredNonces();

  const record = nonceStore.get(nonce);
  if (!record) {
    return false;
  }

  nonceStore.delete(nonce);

  if (record.expiresAt <= Date.now()) {
    return false;
  }

  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return false;
  }

  return record.address === normalizedAddress;
}
