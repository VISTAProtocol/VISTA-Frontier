type Flusher = (sessionId: string, scores: number[]) => Promise<void>;

/**
 * Per-session score buffer. The first heartbeat for a session schedules a
 * flush after `windowMs`; subsequent heartbeats accumulate until the timer
 * fires, at which point the average score is submitted on-chain.
 */
export class SessionBuffer {
  private buffers = new Map<string, number[]>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly windowMs: number,
    private readonly flusher: Flusher,
  ) {}

  push(sessionId: string, score: number): void {
    let scores = this.buffers.get(sessionId);
    if (!scores) {
      scores = [];
      this.buffers.set(sessionId, scores);
      const timer = setTimeout(() => void this.flush(sessionId), this.windowMs);
      // Allow the process to exit even if a buffer is open (test ergonomics).
      timer.unref?.();
      this.timers.set(sessionId, timer);
    }
    scores.push(score);
  }

  private async flush(sessionId: string) {
    const scores = this.buffers.get(sessionId) ?? [];
    this.buffers.delete(sessionId);
    this.timers.delete(sessionId);
    if (scores.length === 0) return;
    try {
      await this.flusher(sessionId, scores);
    } catch (err) {
      console.error(`[oracle-node] flush failed for ${sessionId}:`, err);
    }
  }
}
