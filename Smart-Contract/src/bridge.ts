import {
  encodePacked,
  isAddress,
  keccak256,
  pad,
  type Hex,
} from "viem";

export interface BridgeClaimQuote {
  nativeFee: bigint;
  lzTokenFee: bigint;
}

export function buildBridgeClaimId(
  receiptTokenId: bigint,
  dstEid: number,
): Hex {
  return keccak256(
    encodePacked(["uint256", "uint32"], [receiptTokenId, dstEid]),
  );
}

export function normalizeReceiverBytes32(value: string): Hex {
  if (!value) {
    throw new Error("Receiver is required");
  }

  if (isAddress(value)) {
    return pad(value as Hex, { size: 32 });
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Receiver must be a bytes32 or address");
  }

  return value as Hex;
}

export function normalizeBridgeOptions(value?: string): Hex {
  if (!value || value === "0x") return "0x";

  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Options must be hex bytes");
  }

  return value as Hex;
}
