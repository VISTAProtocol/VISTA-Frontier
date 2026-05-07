/**
 * One-time setup script for vista_protocol on devnet (or any cluster).
 *
 * Reads the admin keypair from ANCHOR_WALLET / ~/.config/solana/id.json,
 * derives all PDAs, and calls `initialize(oracle, vista_wallet)` once.
 *
 * Required env (override defaults):
 *   ANCHOR_PROVIDER_URL        — RPC URL (default: https://api.devnet.solana.com)
 *   ANCHOR_WALLET              — admin keypair path (default: ~/.config/solana/id.json)
 *   USDC_MINT                  — USDC mint pubkey (default: Circle devnet USDC)
 *   ORACLE_PUBKEY              — oracle signer pubkey (REQUIRED)
 *   VISTA_WALLET_PUBKEY        — protocol fee recipient (REQUIRED)
 *   VISTA_PROTOCOL_PROGRAM_ID  — program id (default: from Anchor.toml synced value)
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ORACLE_PUBKEY=<pk> VISTA_WALLET_PUBKEY=<pk> \
 *   npx ts-node scripts/initialize.ts
 *
 * Or via Anchor:
 *   anchor run init
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { VistaProtocol } from "../target/types/vista_protocol";

const DEFAULTS = {
  RPC: "https://api.devnet.solana.com",
  WALLET: path.join(os.homedir(), ".config/solana/id.json"),
  USDC_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  PROGRAM_ID: "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
};

function loadKeypair(filePath: string): Keypair {
  const expanded = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const raw = fs.readFileSync(expanded, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function requirePubkey(envName: string): PublicKey {
  const value = process.env[envName];
  if (!value) {
    console.error(`Missing required env: ${envName}`);
    console.error(
      "Set it to a base58 Solana pubkey (e.g. the oracle signer or fee recipient).",
    );
    process.exit(1);
  }
  try {
    return new PublicKey(value);
  } catch {
    console.error(`Invalid pubkey for ${envName}: ${value}`);
    process.exit(1);
  }
}

async function main() {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? DEFAULTS.RPC;
  const walletPath = process.env.ANCHOR_WALLET ?? DEFAULTS.WALLET;
  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? DEFAULTS.USDC_MINT,
  );
  const oracle = requirePubkey("ORACLE_PUBKEY");
  const vistaWallet = requirePubkey("VISTA_WALLET_PUBKEY");
  const programId = new PublicKey(
    process.env.VISTA_PROTOCOL_PROGRAM_ID ?? DEFAULTS.PROGRAM_ID,
  );

  console.log("┌─ Vista Protocol — initialize");
  console.log("│  RPC          ", rpcUrl);
  console.log("│  Admin wallet ", walletPath);
  console.log("│  Program id   ", programId.toBase58());
  console.log("│  USDC mint    ", usdcMint.toBase58());
  console.log("│  Oracle       ", oracle.toBase58());
  console.log("│  Vista wallet ", vistaWallet.toBase58());
  console.log("└──────────────");

  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadKeypair(walletPath);
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program from local IDL (typed) — works whether or not anchor workspace
  // env is set. Falls back to fetching IDL from chain if local IDL missing.
  const idlPath = path.join(__dirname, "../target/idl/vista_protocol.json");
  if (!fs.existsSync(idlPath)) {
    console.error(
      `IDL not found at ${idlPath}. Run \`anchor build\` first.`,
    );
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<VistaProtocol>(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    programId,
  );
  const [userVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault")],
    programId,
  );
  const [receiptCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("receipt_counter")],
    programId,
  );

  // Idempotence: if config already exists, skip.
  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("⚠  Config PDA already initialized at", configPda.toBase58());
    console.log("   Nothing to do. (Use set_oracle / set_vista_wallet to update.)");
    return;
  }

  // Sanity: admin must hold SOL.
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 0.01 * 1e9) {
    console.error(
      `Admin wallet ${adminKeypair.publicKey.toBase58()} has only ${balance / 1e9} SOL.`,
    );
    console.error("Need ≥0.01 SOL for the initialize tx + rent. Top up first.");
    process.exit(1);
  }

  console.log("→ Sending initialize tx…");
  const sig = await program.methods
    .initialize(oracle, vistaWallet)
    .accountsPartial({
      admin: adminKeypair.publicKey,
      config: configPda,
      usdcMint,
      vaultAuthority,
      userVault,
      receiptCounter,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("✓ initialize tx confirmed");
  console.log("  signature ", sig);
  console.log(
    "  explorer  ",
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  );

  const config = await program.account.config.fetch(configPda);
  console.log("\nConfig PDA state:");
  console.log("  admin        ", config.admin.toBase58());
  console.log("  oracle       ", config.oracle.toBase58());
  console.log("  vista_wallet ", config.vistaWallet.toBase58());
  console.log("  usdc_mint    ", config.usdcMint.toBase58());
}

main().catch((err) => {
  console.error("\nInitialization failed:");
  console.error(err);
  process.exit(1);
});
