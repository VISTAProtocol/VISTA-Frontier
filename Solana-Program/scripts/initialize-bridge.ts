/**
 * One-time setup for vista_bridge on devnet.
 *
 * Calls `initialize_bridge(oracle, vista_wallet, lz_executor_authority)`
 * once. In trusted-relayer mode for the hackathon, the oracle key acts as
 * the LayerZero executor authority so that oracle-node's evmWatcher can
 * sign `receive_campaign_metadata` directly.
 *
 * Required env:
 *   ANCHOR_PROVIDER_URL  — default https://api.devnet.solana.com
 *   ANCHOR_WALLET        — admin keypair path (default ~/.config/solana/id.json)
 *   ORACLE_PUBKEY        — REQUIRED. Oracle node's pubkey (also used as LZ executor)
 *   VISTA_WALLET_PUBKEY  — REQUIRED. Protocol fee recipient pubkey
 *   USDC_MINT            — default VISTA hackathon devnet mint
 *
 * Usage:
 *   ORACLE_PUBKEY=<pk> VISTA_WALLET_PUBKEY=<pk> \
 *     npx ts-node scripts/initialize-bridge.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey(
  "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm",
);

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function loadKeypair(p: string): Keypair {
  const resolved = p.startsWith("~")
    ? path.join(os.homedir(), p.slice(1))
    : p;
  const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const oraclePk = process.env.ORACLE_PUBKEY;
  const vistaWalletPk = process.env.VISTA_WALLET_PUBKEY;
  if (!oraclePk || !vistaWalletPk) {
    console.error(
      "Missing ORACLE_PUBKEY and/or VISTA_WALLET_PUBKEY env. Aborting.",
    );
    process.exit(1);
  }

  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json");

  const connection = new Connection(rpcUrl, "confirmed");
  const admin = loadKeypair(walletPath);

  const oracle = new PublicKey(oraclePk);
  const vistaWallet = new PublicKey(vistaWalletPk);
  const lzExecutorAuthority = oracle; // trusted-relayer stub

  const [bridgeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    PROGRAM_ID,
  );

  console.log("vista_bridge initialize");
  console.log("  rpc                :", rpcUrl);
  console.log("  admin              :", admin.publicKey.toBase58());
  console.log("  bridge_config PDA  :", bridgeConfigPda.toBase58());
  console.log("  oracle             :", oracle.toBase58());
  console.log("  vista_wallet       :", vistaWallet.toBase58());
  console.log("  lz_executor (=oracle):", lzExecutorAuthority.toBase58());
  console.log("  usdc_mint          :", USDC_MINT.toBase58());

  // Check if already initialized.
  const existing = await connection.getAccountInfo(bridgeConfigPda);
  if (existing) {
    console.log(
      "\nbridge_config already exists; skipping. To re-initialize you must close the PDA first.",
    );
    return;
  }

  // initialize_bridge(oracle: Pubkey, vista_wallet: Pubkey, lz_executor_authority: Pubkey)
  const data = Buffer.concat([
    disc("initialize_bridge"),
    oracle.toBuffer(),
    vistaWallet.toBuffer(),
    lzExecutorAuthority.toBuffer(),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: bridgeConfigPda, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: admin.publicKey,
    recentBlockhash: blockhash,
  }).add(ix);
  tx.sign(admin);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  console.log("\ninitialize_bridge tx:", sig);
  console.log(
    "explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
