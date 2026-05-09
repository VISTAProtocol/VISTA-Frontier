/**
 * Re-hydrate Supabase from on-chain OracleNode accounts. Use this after
 * accidentally clearing the `oracle_nodes` table while oracles are still
 * registered on-chain — re-registering would force a 7-day stake lockup,
 * but the chain already has all the truth we need.
 *
 * Reads each oracle's PDA, decodes (oracle, endpoint_url, stake, active,
 * registered_at), and POSTs a `registered` event to
 * `${DASHBOARD_URL}/api/oracle/sync`. The existing handler upserts into
 * `oracle_nodes` (onConflict: oracle_pubkey), so it's idempotent.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   DASHBOARD_URL=http://localhost:3031 \
 *   ORACLE_WEBHOOK_SECRET=supersecret \
 *     npx ts-node scripts/backfill-oracles.ts \
 *       AZ8nJSfM4usUaVy2hRY5vNNNNy8xZtA57cCkQPH53qKt \
 *       FmWb3Bx78X26cdVB3GJuWeCnSpDhaMnyxxcrRQVSqVFB \
 *       8A1Stkwy2H3cePGjwdKatsFVrLgdw66b5Mtwha3pRb5i
 */
import { Connection, PublicKey } from "@solana/web3.js";

const ORACLE_REGISTRY = new PublicKey(
  "Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn",
);

interface OracleNodeView {
  oracle: string;
  endpointUrl: string;
  stake: bigint;
  rewardBalance: bigint;
  registeredAt: number;
  unregisteredAt: number;
  active: boolean;
}

function decodeOracleNode(data: Buffer): OracleNodeView | null {
  // disc(8) | oracle(32) | endpoint_len(4) | endpoint(N) | stake(u64)
  //   | reward(u64) | reputation(i64) | submissions(u64) | slashes(u64)
  //   | registered_at(i64) | unregistered_at(i64) | active(1) | bump(1)
  if (data.length < 8 + 32 + 4) return null;
  const oracle = new PublicKey(data.subarray(8, 40)).toBase58();
  const endpointLen = data.readUInt32LE(40);
  const endpointEnd = 44 + endpointLen;
  if (data.length < endpointEnd + 8 * 7 + 1 + 1) return null;
  const endpointUrl = data.subarray(44, endpointEnd).toString("utf8");
  const stake = data.readBigUInt64LE(endpointEnd);
  const rewardBalance = data.readBigUInt64LE(endpointEnd + 8);
  const registeredAt = Number(data.readBigInt64LE(endpointEnd + 8 * 5));
  const unregisteredAt = Number(data.readBigInt64LE(endpointEnd + 8 * 6));
  const active = data[endpointEnd + 56] === 1;
  return {
    oracle,
    endpointUrl,
    stake,
    rewardBalance,
    registeredAt,
    unregisteredAt,
    active,
  };
}

async function main() {
  const oracles = process.argv.slice(2);
  if (oracles.length === 0) {
    console.error("Usage: backfill-oracles.ts <oracle pubkey> [<oracle pubkey> …]");
    process.exit(1);
  }
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const dashboardUrl = (
    process.env.DASHBOARD_URL ?? "http://localhost:3031"
  ).replace(/\/+$/, "");
  const secret = process.env.ORACLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("✗ ORACLE_WEBHOOK_SECRET env is required (must match dashboard's)");
    process.exit(1);
  }
  const conn = new Connection(rpcUrl, "confirmed");

  for (const arg of oracles) {
    const oracle = new PublicKey(arg);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_node"), oracle.toBuffer()],
      ORACLE_REGISTRY,
    );
    const info = await conn.getAccountInfo(pda);
    if (!info) {
      console.warn(`✗ ${arg} — oracle_node PDA not found on-chain, skipping`);
      continue;
    }
    if (!info.owner.equals(ORACLE_REGISTRY)) {
      console.warn(`✗ ${arg} — PDA owned by ${info.owner.toBase58()}, skipping`);
      continue;
    }
    const decoded = decodeOracleNode(info.data);
    if (!decoded) {
      console.warn(`✗ ${arg} — decode failed`);
      continue;
    }
    console.log(
      `→ ${arg} active=${decoded.active} stake=${decoded.stake} endpoint=${decoded.endpointUrl}`,
    );
    if (!decoded.active) {
      console.log("  (skipping — on-chain `active=false`; nothing to backfill)");
      continue;
    }

    const payload = {
      event: "registered" as const,
      payload: {
        oracle: decoded.oracle,
        endpoint_url: decoded.endpointUrl,
        stake_amount: Number(decoded.stake),
        registered_at: new Date(decoded.registeredAt * 1000).toISOString(),
      },
    };
    const res = await fetch(`${dashboardUrl}/api/oracle/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oracle-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`  ✗ sync ${res.status}: ${await res.text()}`);
    } else {
      console.log("  ✅ upserted into oracle_nodes");
    }

    // Also re-emit reward_balance if non-zero — apply via a synthetic
    // reward_credited event. Skipped: reputation/total_submissions/total_slashes
    // require per-event history we don't have. For demo purposes the
    // balance/active flags are what gates the dashboard UI.
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
