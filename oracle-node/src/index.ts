import { createHash } from "node:crypto";
import process from "node:process";

// Local-dev convenience: load `.env` if present. In prod (Render/Railway/Docker)
// env vars come from the platform, so `.env` won't exist and we silently skip.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — fine, env vars expected from the runtime
}

import express from "express";
import { z } from "zod";

import { PublicKey, SystemProgram } from "@solana/web3.js";

import { AntiReplay } from "./antiReplay.js";
import { BridgeChainClient } from "./bridgeChain.js";
import { CctpWatcher } from "./cctpWatcher.js";
import { ChainClient } from "./chain.js";
import { loadConfig } from "./config.js";
import { EventListener } from "./eventListener.js";
import { startEvmWatchers } from "./evmWatcher.js";
import { PublisherResolver } from "./publisherResolver.js";
import { SessionBuffer } from "./sessionBuffer.js";
import { SyncClient } from "./syncClient.js";
import { scoreSignals } from "./verifier.js";

const heartbeatSchema = z.object({
  sessionId: z.string().min(1),
  apiKey: z.string().optional(),
  userWallet: z.string().optional(),
  campaignId: z.string().optional(),
  publisherWallet: z.string().optional(),
  timestamp: z.coerce.number().int(),
  nonce: z.string().min(1),
  score: z.coerce.number().int().min(0).max(100).optional(),
  signals: z
    .object({
      visibility: z.coerce.number().min(0).max(1).optional(),
      tabFocused: z.boolean().optional(),
      mouseActive: z.boolean().optional(),
      scrolled: z.boolean().optional(),
      pointerVelocityVariance: z.coerce.number().nonnegative().optional(),
      mediaProgress: z.coerce.number().min(0).max(1).optional(),
      idleState: z.string().optional(),
      clickRhythmVariance: z.coerce.number().nonnegative().optional(),
    })
    .partial()
    .default({}),
});

async function main() {
  const cfg = loadConfig();
  const chain = new ChainClient(cfg);
  const sync = new SyncClient(cfg);
  const publisherResolver = new PublisherResolver(cfg);
  const antiReplay = new AntiReplay(
    cfg.antiReplayMaxDriftMs,
    cfg.antiReplayLruSize,
    cfg.antiReplayTtlMs,
  );

  const eventListener = new EventListener(cfg, chain.connection, sync);
  eventListener.start();

  // ─── Cross-chain advertiser deposit pipeline ────────────────────────────
  const bridge = new BridgeChainClient(cfg);
  const cctp = new CctpWatcher(cfg, sync);
  cctp.setOnAttested(async (job) => {
    // CCTP attestation is ready. The Solana side requires:
    //   1. MessageTransmitter.receive_message — Circle's CCTP receiver
    //      program mints USDC into the per-campaign vault PDA. This is
    //      submitted by ANY caller (Circle's program is permissionless),
    //      and requires the raw `message` + `attestation` bytes returned by
    //      Iris. For the hackathon this submission is left to the operator
    //      (e.g. via Circle's CCTP UI / `solana-cli`); see README.
    //   2. vista_bridge.confirm_usdc_received — once USDC has landed in
    //      the vault, this flips `is_active=true`. Permissionless; we call
    //      it as the oracle so the dashboard moves to `bridge_status=active`.
    try {
      const sig = await bridge.submitConfirmUsdcReceived(
        Buffer.from(job.campaignId.slice(2), "hex"),
      );
      console.log(
        `[bridge] confirm_usdc_received campaign=${job.campaignId} tx=${sig}`,
      );
      await sync.post({
        event: "cross_chain_active",
        payload: {
          campaign_id_onchain: job.campaignId,
          confirm_tx: sig,
          activated_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn(
        `[bridge] confirm_usdc_received failed for ${job.campaignId} — vault probably hasn't received CCTP mint yet. Operator needs to run MessageTransmitter.receive_message.`,
        err,
      );
      await sync.post({
        event: "cross_chain_failed",
        payload: {
          campaign_id_onchain: job.campaignId,
          stage: "confirm_usdc_received",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });
  cctp.start();

  startEvmWatchers(cfg, sync, cctp, async (chain, c) => {
    // LayerZero stub: we receive the EVM event and submit
    // receive_campaign_metadata as the oracle (= lz_executor_authority).
    const sig = await bridge.submitReceiveCampaignMetadata({
      campaignId: Buffer.from(c.campaignId.slice(2), "hex"),
      advertiserEvm: Buffer.from(c.advertiser.slice(2), "hex"),
      sourceChainEid: chain.lzEid,
      totalBudget: c.totalBudget,
      ratePerSecond: c.ratePerSecond,
      duration: c.duration,
      cctpNonce: c.cctpNonce,
      // No EVM↔Solana wallet linking yet — attribute to system program.
      // The EVM address is recorded separately on `advertiser_evm`.
      advertiserSolana: SystemProgram.programId,
    });
    console.log(
      `[bridge] receive_campaign_metadata campaign=${c.campaignId} tx=${sig}`,
    );
  });

  let active = false;
  let heartbeatCount = 0;

  // Per-session idempotency caches. The on-chain instructions submit_verification,
  // start_stream and aggregate_results are *one-shot per session* (the
  // attention_aggregator window expires; start_stream uses init; aggregate
  // sets is_settled=true). Only tick_stream runs on every window.
  const submittedSessions = new Set<string>();
  const streamStarted = new Set<string>();
  const aggregatedSessions = new Set<string>();

  async function refreshSelf() {
    try {
      const state = await chain.fetchSelf();
      if (!state) {
        if (active) console.warn("[oracle-node] no longer registered on-chain");
        active = false;
        return;
      }
      const wasActive = active;
      active = state.active;
      if (active && !wasActive) {
        console.log(
          `[oracle-node] active. stake=${state.stake} reward=${state.rewardBalance} endpoint=${state.endpointUrl}`,
        );
      }
    } catch (err) {
      console.warn("[oracle-node] selfCheck failed:", err);
    }
  }

  await refreshSelf();
  setInterval(refreshSelf, cfg.selfCheckSeconds * 1000).unref?.();

  const buffer = new SessionBuffer(cfg.windowSeconds * 1000, async ({ sessionId: sid, scores, meta }) => {
    if (!active) {
      console.log(`[oracle-node] skip flush ${sid}: not active`);
      return;
    }
    const mean = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    const sessionIdBuf = sessionIdToBuffer(sid);
    if (!sessionIdBuf) {
      console.warn(`[oracle-node] invalid session id format: ${sid}`);
      return;
    }
    // Flush fires every windowSeconds while heartbeats keep arriving. The
    // log makes it obvious whether the per-window cadence is sustained.
    console.log(
      `[oracle-node] flush ${sid} window=${cfg.windowSeconds}s heartbeats=${scores.length} mean=${mean}`,
    );

    // ── 1. submit_verification (one-shot per session per oracle).
    // The on-chain aggregator window is short (cfg.window_seconds) and the
    // program rejects duplicate submissions from the same oracle. We only
    // submit on the first flush; subsequent flushes during ongoing viewing
    // skip straight to tick_stream.
    if (!submittedSessions.has(sid)) {
      try {
        const sig = await chain.submitVerification(sessionIdBuf, mean);
        submittedSessions.add(sid);
        console.log(`[oracle-node] submitted ${sid} score=${mean} tx=${sig}`);
        await sync.post({
          event: "submission",
          payload: {
            oracle: chain.keypair.publicKey.toString(),
            session_id_onchain: sid,
            score: mean,
            submitted_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // AlreadySubmitted (0x1773) / WindowExpired (0x1776) / AlreadySettled
        // mean we should never re-attempt for this session — flag it done.
        if (
          msg.includes("AlreadySubmitted") ||
          msg.includes("WindowExpired") ||
          msg.includes("AlreadySettled") ||
          msg.includes("0x1773") ||
          msg.includes("0x1776")
        ) {
          submittedSessions.add(sid);
        } else {
          console.error(`[oracle-node] submit failed for ${sid}:`, msg);
          return;
        }
      }
    }

    // ── 2. Stream cranker (only the designated stream oracle) ─────────────
    const vistaCfg = await chain.fetchVistaConfig().catch(() => null);
    const isStreamOracle = vistaCfg ? chain.isStreamOracle(vistaCfg) : false;
    const campaignIdBuf = parseCampaignId(meta.campaignId);
    const userPk = parsePubkey(meta.userWallet);

    // publisherWallet is optional in the SDK heartbeat — when missing or
    // unparseable (e.g. legacy Mock-Farcaster sending an EVM hex address),
    // resolve it server-side from `apiKey` via the dashboard's
    // /api/publishers/verify-apikey lookup.
    let publisherPk = parsePubkey(meta.publisherWallet);
    if (!publisherPk && meta.apiKey) {
      const resolved = await publisherResolver.resolve(meta.apiKey);
      publisherPk = parsePubkey(resolved ?? undefined);
    }

    if (isStreamOracle && vistaCfg && (!campaignIdBuf || !userPk || !publisherPk)) {
      console.warn(
        `[stream-cranker] cannot crank ${sid} — bad meta:`,
        `userWallet=${meta.userWallet ?? "<missing>"} (parsed=${userPk ? "ok" : "FAIL"})`,
        `publisherWallet=${meta.publisherWallet ?? "<missing>"} (parsed=${publisherPk ? "ok" : "FAIL"})`,
        `campaignId=${meta.campaignId ?? "<missing>"} (parsed=${campaignIdBuf ? "ok" : "FAIL"})`,
        `apiKey=${meta.apiKey ? meta.apiKey.slice(0, 16) + "…" : "<missing>"}`,
        "— check that the publisher row for this apiKey exists in Supabase, and that userWallet is a Solana base58 pubkey.",
      );
    }

    if (isStreamOracle && vistaCfg && campaignIdBuf && userPk && publisherPk) {
      // start_stream — first window only. Idempotent guard: local set +
      // catch the on-chain "already in use" account-already-init error.
      if (!streamStarted.has(sid)) {
        try {
          const sig = await chain.startStream({
            sessionId: sessionIdBuf,
            campaignId: campaignIdBuf,
            userWallet: userPk,
            publisherWallet: publisherPk,
            usdcMint: vistaCfg.usdcMint,
          });
          streamStarted.add(sid);
          console.log(`[stream-cranker] start_stream ${sid} tx=${sig}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("already in use") || msg.includes("Allocate")) {
            streamStarted.add(sid);
          } else {
            console.warn(`[stream-cranker] start_stream failed for ${sid}:`, msg);
          }
        }
      }

      // tick_stream — runs every window with `windowSeconds` worth of elapsed
      // viewing time. This is what actually moves USDC from the campaign
      // vault into the user/publisher escrow PDAs.
      try {
        const sig = await chain.tickStream({
          sessionId: sessionIdBuf,
          campaignId: campaignIdBuf,
          userWallet: userPk,
          publisherWallet: publisherPk,
          vistaWallet: vistaCfg.vistaWallet,
          usdcMint: vistaCfg.usdcMint,
          secondsElapsed: cfg.windowSeconds,
        });
        console.log(`[stream-cranker] tick_stream ${sid} tx=${sig}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const logs =
          (err as { transactionLogs?: string[] }).transactionLogs ??
          (err as { logs?: string[] }).logs ??
          [];
        console.warn(`[stream-cranker] tick_stream failed for ${sid}:`, msg);
        // Surface the actual on-chain reason so this isn't a black box —
        // common causes: campaign budget exhausted, advertiser_token empty,
        // or campaign.active=false after a previous tick zeroed the budget.
        if (logs.length > 0) {
          const programReason = logs.find((l: string) =>
            /AnchorError|Error Message|Error:/i.test(l),
          );
          if (programReason) console.warn("  on-chain:", programReason);
        }
      }
    }

    // ── 3. aggregate_results — permissionless one-shot per session. Every
    // oracle races; whoever runs last (after tick_stream funded the pool +
    // quorum met) wins. Once we know it's settled, stop retrying.
    if (!aggregatedSessions.has(sid)) {
      try {
        const sig = await chain.aggregateResults(sessionIdBuf);
        aggregatedSessions.add(sid);
        console.log(`[stream-cranker] aggregate_results ${sid} tx=${sig}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("AlreadySettled")) {
          aggregatedSessions.add(sid);
        } else if (
          msg.includes("not enough submissions") ||
          msg.includes("NotReadyToAggregate") ||
          msg.includes("EmptyPool") ||
          msg.includes("AccountNotInitialized") ||
          msg.includes("InsufficientSubmissions") ||
          msg.includes("RemainingAccountsMismatch")
        ) {
          // expected race — quorum/funding not ready yet, retry next window
        } else {
          console.warn(`[stream-cranker] aggregate_results failed for ${sid}:`, msg);
        }
      }
    }
  });

  const app = express();

  // Permissive CORS so the browser SDK on a publisher origin can POST
  // heartbeats directly. Heartbeats already carry their own apiKey + nonce
  // anti-replay; the oracle is intentionally an open endpoint.
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      pubkey: chain.keypair.publicKey.toString(),
      active,
    });
  });

  app.post("/heartbeat", async (req, res) => {
    if (!active) {
      res.status(503).json({ error: "oracle is not active" });
      return;
    }
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const {
      sessionId,
      timestamp,
      nonce,
      signals,
      userWallet,
      publisherWallet,
      campaignId,
      apiKey,
    } = parsed.data;
    const replay = antiReplay.check(nonce, timestamp);
    if (!replay.ok) {
      res.status(409).json({ error: replay.reason });
      return;
    }
    const score = scoreSignals(signals);
    buffer.push(sessionId, score, {
      userWallet,
      publisherWallet,
      campaignId,
      apiKey,
    });
    // Trace every heartbeat receipt so it's obvious whether the SDK is
    // actually streaming continuously vs. silently stalling. Sampled to
    // every-other-beat to avoid log spam at 1Hz cadence.
    heartbeatCount += 1;
    if (heartbeatCount % 2 === 1) {
      console.log(
        `[oracle-node] heartbeat #${heartbeatCount} sid=${sessionId.slice(0, 24)}… score=${score}`,
      );
    }
    res.json({ received: true, score });
  });

  app.listen(cfg.port, () => {
    console.log(
      `[oracle-node] listening on :${cfg.port} as ${chain.keypair.publicKey.toString()}`,
    );
  });
}

function sessionIdToBuffer(sessionId: string): Buffer | null {
  // Accept 32-byte hex (64 chars, optional 0x prefix) or arbitrary string
  // hashed to 32 bytes. SDK currently emits `vista_<ts>_<rand>` ids, so we
  // hash; on-chain code only requires a 32-byte identifier.
  const hex = sessionId.startsWith("0x") ? sessionId.slice(2) : sessionId;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  return createHash("sha256").update(sessionId).digest();
}

function parseCampaignId(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

function parsePubkey(raw: string | undefined): PublicKey | null {
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
