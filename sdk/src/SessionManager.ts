export class SessionManager {
  private sessionId: string;
  private usedNonces: Set<string> = new Set();
  private readonly MAX_NONCES = 1000;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  generateNonce(): string {
    const nonce = Math.random().toString(36).substring(2, 10);
    this.usedNonces.add(nonce);

    if (this.usedNonces.size > this.MAX_NONCES) {
      const noncesToDelete = Math.floor(this.MAX_NONCES * 0.1);
      let deleted = 0;
      for (const n of this.usedNonces) {
        if (deleted >= noncesToDelete) break;
        this.usedNonces.delete(n);
        deleted++;
      }
    }

    return nonce;
  }

  private generateSessionId(): string {
    return `vista_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  reset(): void {
    this.sessionId = this.generateSessionId();
    this.usedNonces.clear();
  }
}
