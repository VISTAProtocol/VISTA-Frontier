import type { HeartbeatPayload, HeartbeatResponse } from './types';

export class HeartbeatSender {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private oracleUrl: string;

  constructor(oracleUrl: string) {
    this.oracleUrl = oracleUrl;
  }

  start(
    getPayload: () => HeartbeatPayload,
    onResponse: (res: HeartbeatResponse) => void,
    shouldSkip?: () => boolean
  ): void {
    this.intervalId = setInterval(async () => {
      if (shouldSkip && shouldSkip()) return;
      try {
        const payload = getPayload();
        const res = await fetch(`${this.oracleUrl}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data: HeartbeatResponse = await res.json();
        onResponse(data);
      } catch (err) {
        console.warn('[VISTA] Heartbeat failed:', err);
      }
    }, 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
