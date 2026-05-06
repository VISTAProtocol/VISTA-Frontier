import { Router, Request, Response } from 'express';
import type { HeartbeatPayload } from '../types';
import { createSession, getSession, updateSession, validateHeartbeat } from '../services/sessionManager';
import { calculateScore, runBotDetection } from '../services/attentionVerifier';
import { startStream, tickStream } from '../services/contractCaller';
import { syncSession, syncTick, verifyApiKey } from '../services/dashboardSync';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body as HeartbeatPayload;

    const isKeyValid = await verifyApiKey(payload.apiKey);
    if (!isKeyValid) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    let session = getSession(payload.sessionId);
    const isNewSession = !session;
    if (!session) {
      session = createSession(payload);
    }

    const validation = validateHeartbeat(session, payload);
    if (!validation.valid) {
      res.status(400).json({ valid: false, reason: validation.reason });
      return;
    }

    const score = calculateScore(payload.signals);

    // Push interval before updating lastHeartbeat so bot detection sees it
    const interval = payload.timestamp - session.lastHeartbeat;
    session.recentIntervals.push(interval);
    if (session.recentIntervals.length > 10) session.recentIntervals.shift();

    runBotDetection(session, score, payload.timestamp);

    if (score >= 0.70) {
      session.pendingSeconds++;
      session.validSeconds++;
    }

    session.lastHeartbeat = payload.timestamp;
    session.recentScores.push(score);
    if (session.recentScores.length > 10) session.recentScores.shift();

    // Sync new session to Dashboard API
    if (isNewSession) {
      syncSession(session);
    }

    // Set flag before await to prevent double-start under concurrent requests
    if (!session.streamStarted) {
      session.streamStarted = true;
      const startHash = await startStream(session);
      if (startHash !== '0x') {
        session.onChainStarted = true;
      }
    }

    if (session.pendingSeconds >= 5) {
      try {
        const tick = await tickStream(session, 5);
        session.pendingSeconds = 0;
        session.totalPaid += tick.userAmount + tick.publisherAmount;
        syncTick(tick, session);
      } catch (tickErr) {
        console.error(`[${session.sessionId}] tickStream failed, keeping pendingSeconds`, tickErr);
      }
    }

    updateSession(session);

    console.log(
      `[${session.sessionId}] score:${score.toFixed(2)} valid:true pending:${session.pendingSeconds}s total:${session.validSeconds}s`
    );

    res.status(200).json({
      valid: true,
      score,
      validSeconds: session.validSeconds,
      pendingSeconds: session.pendingSeconds,
      flagged: session.flagged,
    });
  } catch (err) {
    console.error('[heartbeat] unhandled error', err);
    res.status(200).json({
      valid: false,
      score: 0,
      validSeconds: 0,
      pendingSeconds: 0,
      flagged: false,
      error: 'internal error',
    });
  }
});

export default router;
