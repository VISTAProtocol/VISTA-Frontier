import { AnchorProvider, Program, Idl } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "./idl/vista_protocol.json";
import type { VistaProtocol } from "./anchor/vista_protocol";

export function getProvider(
  connection: Connection,
  wallet: AnchorWallet,
): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function getVistaProgram(
  provider: AnchorProvider,
): Program<VistaProtocol> {
  return new Program<VistaProtocol>(idl as Idl as VistaProtocol, provider);
}

// Deterministically derive a 32-byte campaign/session id from a string seed.
// Solana port of bytes32FromSeed (was keccak256 on EVM).
export async function bytes32FromSeed(seed: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(seed);
  // Cast to ArrayBuffer-backed view; modern TS DOM types narrow Uint8Array's
  // generic in a way SubtleCrypto's BufferSource doesn't accept directly.
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(hash);
}
