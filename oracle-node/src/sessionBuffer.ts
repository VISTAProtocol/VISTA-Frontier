export interface SessionMeta {
  userWallet?: string;
  publisherWallet?: string;
  campaignId?: string;
  apiKey?: string;
}

export interface SessionFlush {
  sessionId: string;
  scores: number[];
  meta: SessionMeta;
}

type Flusher = (flush: SessionFlush) => Promise<void>;

interface BufferEntry {
  scores: number[];
  meta: SessionMeta;
  timer: NodeJS.Timeout;
  /** Tick count without any heartbeat — used to auto-evict idle sessions. */
  emptyTicks: number;
}

/**
 * Per-session score buffer.
 *
 * Strict-cadence rewrite: the original implementation used a one-shot
 * `setTimeout` per buffer (re-armed only when the next heartbeat arrived
 * after a flush). That meant if heartbeats were briefly throttled or hit
 * exactly on a window boundary, the next flush window never started and
 * tick_stream stopped firing entirely. Now a `setInterval` runs the
 * flusher every `windowMs` for as long as the session is alive, regardless
 * of whether any heartbeat arrived in the last cycle. Idle sessions
 * (no heartbeat for `IDLE_WINDOWS` consecutive cycles) are auto-evicted.
 *
 * Metadata accumulates across heartbeats: the first non-empty value for
 * each field wins, since the SDK normally sends the same wallet/campaign
 * on every beat anyway.
 */
const IDLE_WINDOWS = 2;

export class SessionBuffer {
  private buffers = new Map<string, BufferEntry>();

  constructor(
    private readonly windowMs: number,
    private readonly flusher: Flusher,
  ) {}

  push(sessionId: string, score: number, meta: SessionMeta = {}): void {
    let entry = this.buffers.get(sessionId);
    if (!entry) {
      entry = {
        scores: [],
        meta: {},
        timer: setInterval(() => void this.tick(sessionId), this.windowMs),
        emptyTicks: 0,
      };
      entry.timer.unref?.();
      this.buffers.set(sessionId, entry);
    }
    entry.scores.push(score);
    entry.emptyTicks = 0;
    entry.meta = {
      userWallet: entry.meta.userWallet ?? meta.userWallet,
      publisherWallet: entry.meta.publisherWallet ?? meta.publisherWallet,
      campaignId: entry.meta.campaignId ?? meta.campaignId,
      apiKey: entry.meta.apiKey ?? meta.apiKey,
    };
  }

  /**
   * Recurring per-window tick. Drains the current scores into the flusher,
   * keeps the buffer alive for the next window, and self-evicts after
   * IDLE_WINDOWS empty cycles.
   */
  private async tick(sessionId: string): Promise<void> {
    const entry = this.buffers.get(sessionId);
    if (!entry) return;
    if (entry.scores.length === 0) {
      entry.emptyTicks += 1;
      if (entry.emptyTicks >= IDLE_WINDOWS) {
        clearInterval(entry.timer);
        this.buffers.delete(sessionId);
      }
      return;
    }
    const scores = entry.scores;
    const meta = { ...entry.meta };
    entry.scores = [];
    entry.emptyTicks = 0;
    try {
      await this.flusher({ sessionId, scores, meta });
    } catch (err) {
      console.error(`[oracle-node] flush failed for ${sessionId}:`, err);
    }
  }
}
