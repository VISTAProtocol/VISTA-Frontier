import { encodePacked, isAddress, keccak256, pad, type Hex } from "viem"

export interface BridgeQuote {
  nativeFee: bigint
  lzTokenFee: bigint
}

export function buildBridgeClaimId(
  receiptTokenId: bigint,
  dstEid: number,
): Hex {
  return keccak256(
    encodePacked(["uint256", "uint32"], [receiptTokenId, dstEid]),
  )
}

export function normalizeReceiverBytes32(value: string): Hex | null {
  if (!value) return null
  if (isAddress(value)) {
    return pad(value as Hex, { size: 32 })
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return null
  }

  return value as Hex
}

export function normalizeBridgeOptions(value?: string): Hex {
  if (!value || value === "0x") return "0x"
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    return "0x"
  }
  return value as Hex
}

export function getBridgeFee(quote: unknown): BridgeQuote | null {
  if (!quote || typeof quote !== "object") return null
  const maybe = quote as { nativeFee?: bigint; lzTokenFee?: bigint } | bigint[]
  if (Array.isArray(maybe)) {
    return {
      nativeFee: maybe[0] ?? 0n,
      lzTokenFee: maybe[1] ?? 0n,
    }
  }
  if (typeof maybe.nativeFee === "bigint" && typeof maybe.lzTokenFee === "bigint") {
    return { nativeFee: maybe.nativeFee, lzTokenFee: maybe.lzTokenFee }
  }
  return null
}
