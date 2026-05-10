/**
 * One-shot init for vista_bridge's global escrow vault that holds the
 * combined user + publisher cross-chain earnings. Idempotent — re-running
 * after the vault already exists fails clean.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   npx tsx scripts/init-bridge-user-vault.ts
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE");

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

async function main() {
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) throw new Error("ANCHOR_WALLET must be set");

  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))),
  );
  const conn = new Connection(rpcUrl, "confirmed");

  const [bridgeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    PROGRAM_ID,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_user_vault_authority")],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_user_vault")],
    PROGRAM_ID,
  );

  // Read bridge_config.usdc_mint (offset 8 + 32 = 40, length 32)
  const cfg = await conn.getAccountInfo(bridgeConfig);
  if (!cfg) throw new Error("bridge_config not found");
  const usdcMint = new PublicKey(cfg.data.subarray(40, 72));

  console.log("admin:                ", admin.publicKey.toBase58());
  console.log("bridge_config:        ", bridgeConfig.toBase58());
  console.log("usdc_mint:            ", usdcMint.toBase58());
  console.log("vault authority PDA:  ", vaultAuthority.toBase58());
  console.log("vault PDA:            ", vault.toBase58());

  const existing = await conn.getAccountInfo(vault);
  if (existing) {
    console.log("\nVault already initialized — nothing to do.");
    return;
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: bridgeConfig, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: disc("initialize_bridge_user_vault"),
  });

  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: admin.publicKey,
    recentBlockhash: blockhash,
  }).add(ix);
  tx.sign(admin);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");

  console.log("\nInitialized. tx:", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
