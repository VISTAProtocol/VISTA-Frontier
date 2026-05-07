// Deprecated — LayerZero EVM↔Solana bridging is no longer used by the
// dashboard now that the protocol runs natively on Solana. Stubs preserved
// so user/dashboard imports compile during migration.
// TODO: delete this file once user/dashboard drops the bridge UI.

export type Hex = `0x${string}`;

export interface BridgeQuote {
  nativeFee: bigint;
  lzTokenFee: bigint;
}

export function buildBridgeClaimId(
  _receiptTokenId: bigint,
  _dstEid: number,
): Hex {
  return "0x";
}

export function normalizeReceiverBytes32(_value: string): Hex | null {
  return null;
}

export function normalizeBridgeOptions(_value?: string): Hex {
  return "0x";
}

export function getBridgeFee(_quote: unknown): BridgeQuote | null {
  return null;
}
