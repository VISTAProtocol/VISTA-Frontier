import { PublicKey } from "@solana/web3.js";

/// Convert a Solana pubkey (32 bytes) to a hex `bytes32` for CCTP/LZ payloads.
/// Solana pubkeys are already 32 bytes, so this is a straight serialization
/// with a `0x` prefix — no left-padding needed.
export function solanaPubkeyToBytes32(pubkey: PublicKey): `0x${string}` {
  const bytes = pubkey.toBytes();
  if (bytes.length !== 32) {
    throw new Error(`expected 32-byte pubkey, got ${bytes.length}`);
  }
  return ("0x" + Buffer.from(bytes).toString("hex")) as `0x${string}`;
}
