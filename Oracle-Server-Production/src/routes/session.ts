import { Router, Request, Response } from 'express';
import { getSession, endSession } from '../services/sessionManager';
import { tickStream, endStream } from '../services/contractCaller';
import { syncTick, syncEnd, verifyApiKey } from '../services/dashboardSync';

const router = Router();

router.post('/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, apiKey } = req.body as { sessionId: string; apiKey: string };

    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const isKeyValid = await verifyApiKey(apiKey);
    if (!isKeyValid) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (!session.active) {
      res.status(200).json({ success: true, totalSeconds: session.validSeconds });
      return;
    }

    // Mark inactive immediately to prevent watchdog double-fire during awaits
    session.active = false;

    if (!session.onChainStarted) {
      endSession(sessionId);
      res.status(200).json({ success: true, totalSeconds: session.validSeconds });
      return;
    }

    if (session.pendingSeconds > 0) {
      try {
        const tick = await tickStream(session, session.pendingSeconds);
        session.pendingSeconds = 0;
        session.totalPaid += tick.userAmount + tick.publisherAmount;
        syncTick(tick, session);
      } catch (tickErr) {
        console.error(`[${sessionId}] final tickStream failed`, tickErr);
      }
    }

    const txHash = await endStream(session);
    syncEnd(session, txHash);
    endSession(sessionId);

    res.status(200).json({ success: true, totalSeconds: session.validSeconds });
  } catch (err) {
    console.error('[session/end] error', err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
