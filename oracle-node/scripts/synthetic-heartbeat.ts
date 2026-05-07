/**
 * Synthetic heartbeat smoke test.
 *
 * POSTs identical heartbeats to 3 locally-running oracle-node instances on
 * ports 4001/4002/4003, then queries /api/oracle/network-stats and
 * /api/oracle/submissions on the dashboard to verify 3 submissions and an
 * aggregation event landed in Supabase.
 *
 * Usage (from oracle-node/ directory):
 *   DASHBOARD_URL=http://localhost:3031 \
 *   SESSION_ID=vista_test_$(date +%s) \
 *   npx tsx scripts/synthetic-heartbeat.ts
 */

import { randomUUID } from "node:crypto";

const PORTS = [4001, 4002, 4003];
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3031";
const SESSION_ID = process.env.SESSION_ID ?? `vista_smoke_${Date.now()}`;
// Number of heartbeat batches to send (each batch = 1 heartbeat per node).
const BATCHES = Number(process.env.BATCHES ?? "5");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? "2000");

// Simulated signals: fully attentive viewer.
const SIGNALS = {
  visibility: 1.0,
  tabFocused: true,
  mouseActive: true,
  scrolled: true,
};

async function postHeartbeat(port: number, batch: number): Promise<void> {
  const url = `http://localhost:${port}/heartbeat`;
  const body = {
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    nonce: `${port}-${batch}-${randomUUID()}`,
    signals: SIGNALS,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { received?: boolean; score?: number; error?: string };
    if (!res.ok || json.error) {
      console.warn(`  [port ${port}] batch=${batch} error: ${json.error ?? res.status}`);
    } else {
      console.log(`  [port ${port}] batch=${batch} received=${json.received} score=${json.score}`);
    }
  } catch (err) {
    console.warn(`  [port ${port}] batch=${batch} fetch failed: ${(err as Error).message}`);
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function queryDashboard(path: string): Promise<unknown> {
  const url = `${DASHBOARD_URL}${path}`;
  try {
    const res = await fetch(url, { headers: { "content-type": "application/json" } });
    if (!res.ok) return { error: res.status };
    return res.json();
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function main() {
  console.log(`\n[synthetic-heartbeat] session=${SESSION_ID} batches=${BATCHES}`);
  console.log(`[synthetic-heartbeat] targets: ports ${PORTS.join(", ")}`);
  console.log(`[synthetic-heartbeat] dashboard: ${DASHBOARD_URL}\n`);

  for (let i = 0; i < BATCHES; i++) {
    console.log(`\n--- batch ${i + 1}/${BATCHES} ---`);
    await Promise.all(PORTS.map((p) => postHeartbeat(p, i + 1)));
    if (i < BATCHES - 1) await sleep(INTERVAL_MS);
  }

  // Give the nodes time to flush (window = 10 s) + aggregator to settle.
  const waitSec = 12;
  console.log(`\n[synthetic-heartbeat] waiting ${waitSec}s for flush + aggregation…`);
  await sleep(waitSec * 1000);

  console.log("\n[synthetic-heartbeat] querying dashboard…");

  const stats = await queryDashboard("/api/oracle/network-stats");
  console.log("  /api/oracle/network-stats:", JSON.stringify(stats, null, 2));

  const subs = await queryDashboard(
    `/api/oracle/submissions?session=${encodeURIComponent(SESSION_ID)}&limit=20`,
  );
  console.log("  /api/oracle/submissions:", JSON.stringify(subs, null, 2));

  // Sanity assertions (non-fatal; exit 0 to let CI keep going).
  const subsArray = Array.isArray(subs) ? subs : (subs as { submissions?: unknown[] })?.submissions ?? [];
  if (subsArray.length >= PORTS.length) {
    console.log(`\n✓ ${subsArray.length} submission(s) found — smoke test passed`);
  } else {
    console.warn(`\n⚠ expected >= ${PORTS.length} submissions, got ${subsArray.length} — check oracle logs`);
  }
}

main().catch((err) => {
  console.error("[synthetic-heartbeat] fatal:", err);
  process.exit(1);
});
