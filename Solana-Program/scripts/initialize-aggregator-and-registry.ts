/**
 * One-shot setup for `attention_aggregator` + `oracle_registry` on devnet.
 *
 * Both inits are idempotent — re-running the script is a no-op once both
 * config PDAs exist.
 *
 * Required env (override defaults):
 *   ANCHOR_PROVIDER_URL                    — RPC URL (default: devnet)
 *   ANCHOR_WALLET                          — admin keypair (default: ~/.config/solana/id.json)
 *   USDC_MINT                              — SPL mint (default: VISTA hackathon mint)
 *   VISTA_PROTOCOL_PROGRAM_ID              — vista_protocol id (default: synced)
 *   ORACLE_REGISTRY_PROGRAM_ID             — oracle_registry id (default: synced)
 *   ATTENTION_AGGREGATOR_PROGRAM_ID        — attention_aggregator id (default: synced)
 *
 * Tunables (only used at FIRST init; no-op once initialized):
 *   AGGREGATOR_MIN_QUORUM                  — default 3
 *   AGGREGATOR_DEVIATION_BPS               — default 2000 (20%)
 *   AGGREGATOR_WINDOW_SECONDS              — default 10
 *   REGISTRY_MIN_STAKE                     — default 100_000_000 (100 USDC at 6 decimals)
 *   REGISTRY_SLASH_BPS                     — default 1000 (10%)
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   USDC_MINT=2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm \
 *   npx ts-node scripts/initialize-aggregator-and-registry.ts
 */

import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
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

import type { OracleRegistry } from "../target/types/oracle_registry";
import type { AttentionAggregator } from "../target/types/attention_aggregator";

const DEFAULTS = {
  RPC: "https://api.devnet.solana.com",
  WALLET: path.join(os.homedir(), ".config/solana/id.json"),
  USDC_MINT: "2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm",
  VISTA_PROTOCOL: "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
  ORACLE_REGISTRY: "Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn",
  ATTENTION_AGGREGATOR: "6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH",
};

function loadKeypair(filePath: string): Keypair {
  const expanded = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const raw = fs.readFileSync(expanded, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function loadIdlJson(name: string): unknown {
  const idlPath = path.join(__dirname, `../target/idl/${name}.json`);
  if (!fs.existsSync(idlPath)) {
    console.error(`IDL not found at ${idlPath}. Run \`anchor build\` first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

async function main() {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? DEFAULTS.RPC;
  const walletPath = process.env.ANCHOR_WALLET ?? DEFAULTS.WALLET;
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? DEFAULTS.USDC_MINT);
  const vistaProtocolId = new PublicKey(
    process.env.VISTA_PROTOCOL_PROGRAM_ID ?? DEFAULTS.VISTA_PROTOCOL,
  );
  const oracleRegistryId = new PublicKey(
    process.env.ORACLE_REGISTRY_PROGRAM_ID ?? DEFAULTS.ORACLE_REGISTRY,
  );
  const aggregatorId = new PublicKey(
    process.env.ATTENTION_AGGREGATOR_PROGRAM_ID ?? DEFAULTS.ATTENTION_AGGREGATOR,
  );

  const minQuorum = Number(process.env.AGGREGATOR_MIN_QUORUM ?? "3");
  const deviationBps = Number(process.env.AGGREGATOR_DEVIATION_BPS ?? "2000");
  const windowSeconds = Number(process.env.AGGREGATOR_WINDOW_SECONDS ?? "10");
  const minStake = new BN(process.env.REGISTRY_MIN_STAKE ?? "100000000");
  const slashBps = Number(process.env.REGISTRY_SLASH_BPS ?? "1000");

  console.log("┌─ Aggregator + Registry init");
  console.log("│  RPC                ", rpcUrl);
  console.log("│  Admin wallet       ", walletPath);
  console.log("│  USDC mint          ", usdcMint.toBase58());
  console.log("│  vista_protocol     ", vistaProtocolId.toBase58());
  console.log("│  oracle_registry    ", oracleRegistryId.toBase58());
  console.log("│  attention_aggregator", aggregatorId.toBase58());
  console.log("└──────────────");

  const connection = new Connection(rpcUrl, "confirmed");
  const adminKeypair = loadKeypair(walletPath);
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 0.05 * 1e9) {
    console.error(
      `Admin ${adminKeypair.publicKey.toBase58()} has only ${balance / 1e9} SOL.`,
    );
    console.error("Need ≥0.05 SOL for the two init txs + rent. Top up first.");
    process.exit(1);
  }

  // ── 1. attention_aggregator ──────────────────────────────────────────────
  const aggregator = new Program<AttentionAggregator>(
    loadIdlJson("attention_aggregator") as AttentionAggregator,
    provider,
  );
  const [aggCfg] = PublicKey.findProgramAddressSync(
    [Buffer.from("aggregator_config")],
    aggregatorId,
  );
  const [aggSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("aggregator_signer")],
    aggregatorId,
  );

  console.log("\n→ attention_aggregator");
  console.log("  config PDA  ", aggCfg.toBase58());
  console.log("  signer PDA  ", aggSigner.toBase58());

  if (await connection.getAccountInfo(aggCfg)) {
    console.log("  ⚠  already initialized — skipping");
  } else {
    const sig = await aggregator.methods
      .initialize(
        vistaProtocolId,
        oracleRegistryId,
        minQuorum,
        deviationBps,
        new BN(windowSeconds),
      )
      .accountsPartial({
        admin: adminKeypair.publicKey,
        config: aggCfg,
        aggregatorSigner: aggSigner,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("  ✓ initialized — tx:", sig);
  }

  // ── 2. oracle_registry ───────────────────────────────────────────────────
  const registry = new Program<OracleRegistry>(
    loadIdlJson("oracle_registry") as OracleRegistry,
    provider,
  );
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    oracleRegistryId,
  );
  const [stakeAuth] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_authority")],
    oracleRegistryId,
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault")],
    oracleRegistryId,
  );
  const [rewardAuth] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_authority")],
    oracleRegistryId,
  );
  const [rewardVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_vault")],
    oracleRegistryId,
  );

  console.log("\n→ oracle_registry");
  console.log("  registry PDA", registryPda.toBase58());
  console.log("  stake_vault ", stakeVault.toBase58());
  console.log("  reward_vault", rewardVault.toBase58());

  if (await connection.getAccountInfo(registryPda)) {
    console.log("  ⚠  already initialized — skipping");
  } else {
    // Mirrors devnet-e2e: store the aggregator program id; the on-chain
    // signer check derives `aggregator_signer` PDA from this and validates
    // signer matches.
    const sig = await registry.methods
      .initialize(aggregatorId, minStake, slashBps)
      .accountsPartial({
        admin: adminKeypair.publicKey,
        registry: registryPda,
        usdcMint,
        stakeAuthority: stakeAuth,
        stakeVault,
        rewardAuthority: rewardAuth,
        rewardVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("  ✓ initialized — tx:", sig);
  }

  console.log("\n✓ All set. Oracle-node can now self-register via register_oracle.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
