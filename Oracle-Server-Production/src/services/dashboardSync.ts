import { toBytes32 } from './contractCaller';
import type { TickResult, SessionState } from '../types';

const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL ?? '';
const DASHBOARD_API_SECRET = process.env.DASHBOARD_API_SECRET ?? '';

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  if (!DASHBOARD_API_URL) return true; // If no dashboard configured, skip validation
  try {
    const res = await fetch(`${DASHBOARD_API_URL}/api/publishers/verify-apikey?apiKey=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      headers: {
        'x-oracle-secret': DASHBOARD_API_SECRET,
      },
    });
    return res.ok;
  } catch (err) {
    console.error('[verifyApiKey] dashboard sync failed', err);
    return false;
  }
}

export function syncSession(session: SessionState): void {
  if (!DASHBOARD_API_URL) return;
  fetch(`${DASHBOARD_API_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-oracle-secret': DASHBOARD_API_SECRET,
    },
    body: JSON.stringify({
      sessionIdOnchain: toBytes32(session.sessionId),
      campaignIdOnchain: session.campaignId,
      userWallet: session.userWallet,
      publisherWallet: session.publisherWallet,
    }),
  }).then(async res => {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[syncSession] dashboard returned ${res.status}: ${body}`);
    }
  }).catch(err => console.error('[syncSession] dashboard sync failed', err));
}

export async function syncTick(tick: TickResult, session: SessionState): Promise<void> {
  if (!DASHBOARD_API_URL) return;
  // Skip sync if effectiveSeconds rounded to 0 (flagged session with 1 pending second × 0.5 multiplier)
  if (tick.secondsElapsed <= 0) return;
  try {
    const res = await fetch(`${DASHBOARD_API_URL}/api/ticks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-oracle-secret': DASHBOARD_API_SECRET,
      },
      body: JSON.stringify({
        sessionIdOnchain: toBytes32(session.sessionId),
        userWallet: session.userWallet,
        publisherWallet: session.publisherWallet,
        userAmount: Number(tick.userAmount),
        publisherAmount: Number(tick.publisherAmount),
        totalAmount: Number(tick.userAmount + tick.publisherAmount),
        secondsElapsed: tick.secondsElapsed,
        blockTimestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[syncTick] dashboard returned ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[syncTick] dashboard sync failed', err);
  }
}

export async function syncEnd(session: SessionState, txHash: string): Promise<void> {
  if (!DASHBOARD_API_URL) return;
  try {
    const res = await fetch(`${DASHBOARD_API_URL}/api/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-oracle-secret': DASHBOARD_API_SECRET,
      },
      body: JSON.stringify({
        tokenId: txHash || crypto.randomUUID(),
        sessionIdOnchain: toBytes32(session.sessionId),
        userWallet: session.userWallet,
        publisherWallet: session.publisherWallet,
        campaignIdOnchain: session.campaignId,
        secondsVerified: session.validSeconds,
        totalPaid: Number(session.totalPaid),
        mintedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[syncEnd] dashboard returned ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[syncEnd] dashboard sync failed', err);
  }
}
