/**
 * Admin-only: update vista_bridge `bridge_config.usdc_mint` to point at the
 * VISTA custom hackathon mint (Arsitektur 2). The bridge was originally
 * initialized with real Circle devnet USDC; this rotates it to a mint whose
 * mint authority is the relayer key, so the relayer can mint Solana-side
 * USDC after Circle attests the EVM-side burn.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   NEW_MINT=2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm \
 *   npx tsx scripts/update-bridge-usdc-mint.ts
 */
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "node:fs";

const PROGRAM_ID = new PublicKey("9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE");

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

async function main() {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) throw new Error("ANCHOR_WALLET must be set (path to admin keypair)");
  const newMintStr = process.env.NEW_MINT;
  if (!newMintStr) throw new Error("NEW_MINT must be set (base58 pubkey)");
  const newMint = new PublicKey(newMintStr);

  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))),
  );
  const conn = new Connection(rpcUrl, "confirmed");
  const [bridgeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    PROGRAM_ID,
  );

  // Read current state for the log line
  const before = await conn.getAccountInfo(bridgeConfig);
  if (!before) throw new Error("bridge_config PDA not found");
  const oldMint = new PublicKey(before.data.subarray(8 + 32, 8 + 64));
  const adminOnChain = new PublicKey(before.data.subarray(8, 8 + 32));

  console.log("RPC:                       ", rpcUrl);
  console.log("Program:                   ", PROGRAM_ID.toBase58());
  console.log("BridgeConfig PDA:          ", bridgeConfig.toBase58());
  console.log("On-chain admin:            ", adminOnChain.toBase58());
  console.log("Local admin keypair:       ", admin.publicKey.toBase58());
  if (!admin.publicKey.equals(adminOnChain)) {
    throw new Error("local keypair is not the on-chain admin — cannot sign update_usdc_mint");
  }
  console.log("Current usdc_mint:         ", oldMint.toBase58());
  console.log("New usdc_mint:             ", newMint.toBase58());
  if (oldMint.equals(newMint)) {
    console.log("No-op (already set). Exiting.");
    return;
  }

  const data = Buffer.concat([disc("update_usdc_mint"), newMint.toBuffer()]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: bridgeConfig, isSigner: false, isWritable: true },
    ],
    data,
  });

  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: admin.publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(admin);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  console.log("Tx signature:              ", sig);

  const after = await conn.getAccountInfo(bridgeConfig);
  const updatedMint = new PublicKey(after!.data.subarray(8 + 32, 8 + 64));
  console.log("After update usdc_mint:    ", updatedMint.toBase58());
  if (!updatedMint.equals(newMint)) {
    throw new Error("post-tx mint does not match expected new mint");
  }
  console.log("Update successful.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
