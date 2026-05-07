import { createHash } from "node:crypto";

import express from "express";
import { z } from "zod";

import { AntiReplay } from "./antiReplay.js";
import { ChainClient } from "./chain.js";
import { loadConfig } from "./config.js";
import { EventListener } from "./eventListener.js";
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
