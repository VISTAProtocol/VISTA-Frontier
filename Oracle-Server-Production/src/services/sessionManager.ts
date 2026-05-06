import type { SessionState, HeartbeatPayload, ValidationResult } from '../types';

const sessions = new Map<string, SessionState>();

export function createSession(payload: HeartbeatPayload): SessionState {
  const now = Date.now();
  const session: SessionState = {
    sessionId: payload.sessionId,
    campaignId: payload.campaignId,
    userWallet: payload.userWallet,
    publisherWallet: payload.publisherWallet,
    startedAt: now,
    lastHeartbeat: now,
    validSeconds: 0,
    pendingSeconds: 0,
    usedNonces: new Set(),
    recentScores: [],
    recentIntervals: [],
    streamStarted: false,
    onChainStarted: false,
    flagged: false,
    active: true,
    totalPaid: 0n,
  };
  sessions.set(payload.sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function updateSession(session: SessionState): void {
  sessions.set(session.sessionId, session);
}

export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.active = false;
    sessions.set(sessionId, session);
  }
}

export function validateHeartbeat(session: SessionState, payload: HeartbeatPayload): ValidationResult {
  if (session.usedNonces.has(payload.nonce)) {
    return { valid: false, reason: 'duplicate nonce' };
  }
  session.usedNonces.add(payload.nonce);

  if (Math.abs(Date.now() - payload.timestamp) > 30_000) {
    return { valid: false, reason: 'timestamp drift' };
  }

  if (payload.timestamp - session.lastHeartbeat < 500) {
    return { valid: false, reason: 'too fast' };
  }

  return { valid: true };
}

export function startWatchdog(onTimeout: (session: SessionState) => void): void {
  setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (session.active && now - session.lastHeartbeat > 15_000) {
        onTimeout(session);
      }
    }
  }, 5_000);
}
