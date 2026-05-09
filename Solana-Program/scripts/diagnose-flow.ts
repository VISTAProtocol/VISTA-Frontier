/**
 * Read-only diagnostic: walks through the on-chain state for a given
 * sessionId or wallet pair and reports whether tick_stream is actually
 * funding user_balance / publisher_balance, plus the AttentionSession +
 * validator_pool state. Useful when the dashboard shows zero balance
 * despite oracle submissions succeeding.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *     npx ts-node scripts/diagnose-flow.ts \
 *       <userWallet base58> <publisherWallet base58> [sessionId hex]
 *
 * sessionId is optional — if provided (32-byte hex, with or without 0x),
 * the script also reads the per-session AttentionSession + validator_pool.
 */
import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const VISTA_PROTOCOL = new PublicKey(
  "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
);
const ORACLE_REGISTRY = new PublicKey(
  "Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn",
);
const ATTENTION_AGGREGATOR = new PublicKey(
  "6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH",
);

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds as Buffer[], programId)[0];
}

function fmtUsdc(raw: bigint | number): string {
  const n = typeof raw === "bigint" ? Number(raw) : raw;
  return `${(n / 1e6).toFixed(6)} USDC (raw=${n})`;
}

async function main() {
  const [userArg, publisherArg, sessionArg] = process.argv.slice(2);
  if (!userArg || !publisherArg) {
    console.error(
      "Usage: diagnose-flow.ts <userWallet> <publisherWallet> [sessionId hex]",
    );
    process.exit(1);
  }
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;

  const user = new PublicKey(userArg);
  const publisher = new PublicKey(publisherArg);

  // ── vista_protocol global config ────────────────────────────────────
  const cfgPda = pda([Buffer.from("config")], VISTA_PROTOCOL);
  const cfgInfo = await conn.getAccountInfo(cfgPda);
  if (!cfgInfo) {
    console.error("✗ vista_protocol config not found");
    process.exit(1);
  }
  const usdcMint = new PublicKey(cfgInfo.data.subarray(40, 72));
  const streamOracle = new PublicKey(cfgInfo.data.subarray(72, 104));
  const vistaWallet = new PublicKey(cfgInfo.data.subarray(104, 136));
  console.log("─── vista_protocol.config ───");
  console.log("  usdc_mint    :", usdcMint.toBase58());
  console.log("  oracle (stream):", streamOracle.toBase58());
  console.log("  vista_wallet :", vistaWallet.toBase58());

  // ── user_vault (shared escrow) ──────────────────────────────────────
  const userVault = pda([Buffer.from("user_vault")], VISTA_PROTOCOL);
  try {
    const acc = await getAccount(conn, userVault);
    console.log("\n─── user_vault token account (shared) ───");
    console.log("  balance      :", fmtUsdc(acc.amount));
  } catch (e) {
    console.log("\n✗ user_vault not initialized:", (e as Error).message);
  }

  // ── per-wallet balance PDAs (what `withdraw` reads) ────────────────
  for (const [label, wallet] of [
    ["user", user],
    ["publisher", publisher],
  ] as const) {
    const balancePda = pda(
      [Buffer.from("balance"), wallet.toBuffer()],
      VISTA_PROTOCOL,
    );
    const info = await conn.getAccountInfo(balancePda);
    console.log(`\n─── ${label}_balance PDA (${balancePda.toBase58()}) ───`);
    if (!info) {
      console.log("  ✗ not initialized — tick_stream has NEVER run for this wallet");
      continue;
    }
    // disc(8) | wallet(32) | balance(u64) | bump(1)
    const balance = info.data.readBigUInt64LE(40);
    console.log("  balance      :", fmtUsdc(balance));
    if (balance === 0n) {
      console.log(
        "  ⚠  zero balance — either tick_stream silently failed, or all of it has been withdrawn",
      );
    }
  }

  // ── per-session state ───────────────────────────────────────────────
  if (sessionArg) {
    const hex = sessionArg.startsWith("0x") ? sessionArg.slice(2) : sessionArg;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      console.error("\n✗ sessionId must be 32-byte hex (64 chars)");
      process.exit(1);
    }
    const sessionId = Buffer.from(hex, "hex");

    const sessionPda = pda([Buffer.from("session"), sessionId], VISTA_PROTOCOL);
    const sInfo = await conn.getAccountInfo(sessionPda);
    console.log(`\n─── vista_protocol.session ${hex.slice(0, 12)}... ───`);
    if (!sInfo) {
      console.log("  ✗ not initialized — start_stream has NEVER run for this session");
    } else {
      // disc(8) | session_id(32) | campaign_id(32) | user(32) | publisher(32)
      //   | seconds_verified(u64) | total_paid(u64) | active(1) | started_at(i64) | bump(1)
      const sd = sInfo.data;
      console.log("  campaign_id   : 0x" + sd.subarray(40, 72).toString("hex"));
      console.log("  user_wallet   :", new PublicKey(sd.subarray(72, 104)).toBase58());
      console.log("  publisher     :", new PublicKey(sd.subarray(104, 136)).toBase58());
      console.log("  seconds_verified:", sd.readBigUInt64LE(136).toString());
      console.log("  total_paid    :", fmtUsdc(sd.readBigUInt64LE(144)));
      console.log("  active        :", sd[152] === 1);
      console.log("  started_at    :", new Date(Number(sd.readBigInt64LE(153)) * 1000).toISOString());
    }

    // validator_pool_vault
    const vpv = pda([Buffer.from("validator_pool"), sessionId], VISTA_PROTOCOL);
    try {
      const acc = await getAccount(conn, vpv);
      console.log("\n─── validator_pool_vault (per session) ───");
      console.log("  balance      :", fmtUsdc(acc.amount));
      if (acc.amount > 0n) {
        console.log("  ⚠  non-zero — aggregate_results has NOT drained this yet");
      }
    } catch {
      console.log("\n  validator_pool_vault not initialized");
    }

    // attention_aggregator AttentionSession
    const asPda = pda([Buffer.from("attention_session"), sessionId], ATTENTION_AGGREGATOR);
    const asInfo = await conn.getAccountInfo(asPda);
    console.log("\n─── attention_aggregator.AttentionSession ───");
    if (!asInfo) {
      console.log("  ✗ not initialized — no oracle has called submit_verification yet");
    } else {
      // disc(8) | session_id(32) | window_start(8) | submissions_count(1) | submissions[16] | is_settled(1) ...
      const ad = asInfo.data;
      const count = ad.readUInt8(48);
      const SUB = 32 + 1 + 8 + 1; // 42
      console.log("  submissions_count:", count);
      for (let i = 0; i < count; i++) {
        const o = 49 + i * SUB;
        const oracle = new PublicKey(ad.subarray(o, o + 32)).toBase58();
        const score = ad.readUInt8(o + 32);
        const submittedAt = ad.readBigInt64LE(o + 33);
        const isOutlier = ad[o + 41] === 1;
        console.log(
          `    [${i}] ${oracle} score=${score} outlier=${isOutlier} at=${new Date(Number(submittedAt) * 1000).toISOString()}`,
        );
      }
      const settledOff = 49 + 16 * SUB;
      console.log("  is_settled    :", ad[settledOff] === 1);
      console.log("  consensus_score:", ad.readUInt8(settledOff + 1));
      console.log("  consensus_reached:", ad[settledOff + 2] === 1);
      console.log("  settled_at    :", new Date(Number(ad.readBigInt64LE(settledOff + 3)) * 1000).toISOString());
    }
  }

  // ── reward_vault (oracle rewards pool) ──────────────────────────────
  const rewardVault = pda([Buffer.from("reward_vault")], ORACLE_REGISTRY);
  try {
    const acc = await getAccount(conn, rewardVault);
    console.log("\n─── oracle_registry.reward_vault ───");
    console.log("  balance      :", fmtUsdc(acc.amount));
  } catch {
    console.log("\n  reward_vault not initialized");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
