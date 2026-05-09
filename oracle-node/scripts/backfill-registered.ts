/**
 * One-shot backfill: scan oracle_registry for existing OracleNode PDAs and
 * POST a synthetic `registered` sync event for each — fixing dashboard's
 * Supabase mirror that missed live registrations during the period when the
 * eventListener payload schema was wrong.
 *
 * Usage:
 *   ORACLE_KEYPAIR_PATH=./local-oracles/oracle_1.json \
 *   DASHBOARD_URL=http://localhost:3031 \
 *   ORACLE_WEBHOOK_SECRET=supersecret \
 *   RPC_URL=https://api.devnet.solana.com \
 *     npx tsx scripts/backfill-registered.ts
 *
 * Reads ORACLE_KEYPAIR_PATH only to satisfy the existing config loader; the
 * registered keypair itself is irrelevant — we walk all OracleNode accounts
 * owned by the oracle_registry program ID.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { loadConfig } from "../src/config.js";
import { SyncClient } from "../src/syncClient.js";

async function main() {
  const cfg = loadConfig();
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const sync = new SyncClient(cfg);

  console.log(`[backfill] scanning OracleNode accounts at ${cfg.programs.oracleRegistry.toBase58()}`);

  // Anchor's account discriminator for OracleNode = sha256("account:OracleNode")[..8]
  const { createHash } = await import("node:crypto");
  const disc = createHash("sha256")
    .update("account:OracleNode")
    .digest()
    .subarray(0, 8);

  const accounts = await conn.getProgramAccounts(cfg.programs.oracleRegistry, {
    filters: [{ memcmp: { offset: 0, bytes: disc.toString("base64"), encoding: "base64" } }],
    commitment: "confirmed",
  });

  console.log(`[backfill] found ${accounts.length} OracleNode accounts`);

  for (const { account, pubkey } of accounts) {
    const data = account.data;
    // Layout (after 8-byte disc):
    //   oracle: Pubkey (32)
    //   endpoint_url: String (4 byte len + N)
    //   stake: u64 (8)
    //   reward_balance: u64 (8)
    //   reputation: i64 (8)
    //   total_submissions: u64 (8)
    //   total_slashes: u64 (8)
    //   registered_at: i64 (8)
    //   unregistered_at: i64 (8)
    //   active: bool (1)
    //   bump: u8 (1)
    if (data.length < 8 + 32 + 4) {
      console.warn(`  skip ${pubkey.toBase58()}: too short (${data.length})`);
      continue;
    }
    const oracle = new PublicKey(data.subarray(8, 40)).toBase58();
    const endpointLen = data.readUInt32LE(40);
    const endpointUrl = data.subarray(44, 44 + endpointLen).toString("utf8");
    const stakeOffset = 44 + endpointLen;
    if (data.length < stakeOffset + 8 * 7 + 1) {
      console.warn(`  skip ${pubkey.toBase58()}: stake offset out of range`);
      continue;
    }
    const stake = data.readBigUInt64LE(stakeOffset);
    const registeredAt = data.readBigInt64LE(stakeOffset + 8 * 5); // skip stake/reward/rep/subs/slashes
    const active = data[stakeOffset + 8 * 7] === 1;

    if (!active) {
      console.log(`  skip ${oracle}: inactive`);
      continue;
    }

    await sync.post({
      event: "registered",
      payload: {
        oracle,
        endpoint_url: endpointUrl,
        stake_amount: Number(stake),
        registered_at: new Date(Number(registeredAt) * 1000).toISOString(),
      },
    });
    console.log(`  → posted ${oracle} (endpoint=${endpointUrl}, stake=${stake})`);
  }

  console.log("[backfill] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
