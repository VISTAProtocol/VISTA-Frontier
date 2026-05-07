import { createHash } from "node:crypto";

import express from "express";
import { z } from "zod";

import { SystemProgram } from "@solana/web3.js";

import { AntiReplay } from "./antiReplay.js";
import { BridgeChainClient } from "./bridgeChain.js";
import { CctpWatcher } from "./cctpWatcher.js";
import { ChainClient } from "./chain.js";
import { loadConfig } from "./config.js";
import { EventListener } from "./eventListener.js";
import { startEvmWatchers } from "./evmWatcher.js";
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

  const buffer = new SessionBuffer(cfg.windowSeconds * 1000, async (sid, scores) => {
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
    try {
      const sig = await chain.submitVerification(sessionIdBuf, mean);
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
      console.error(`[oracle-node] submit failed for ${sid}:`, err);
    }
  });

  const app = express();
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
    const { sessionId, timestamp, nonce, signals } = parsed.data;
    const replay = antiReplay.check(nonce, timestamp);
    if (!replay.ok) {
      res.status(409).json({ error: replay.reason });
      return;
    }
    const score = scoreSignals(signals);
    buffer.push(sessionId, score);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
