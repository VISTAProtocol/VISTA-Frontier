export interface HeartbeatPayload {
  sessionId: string;
  apiKey: string;
  userWallet: string;
  campaignId: string;
  publisherWallet: string;
  timestamp: number;
  nonce: string;
  score: number;
  signals: {
    visibility: number;
    tabFocused: boolean;
    mouseActive: boolean;
    scrolled: boolean;
  };
}

export interface SessionState {
  sessionId: string;
  campaignId: string;
  userWallet: string;
  publisherWallet: string;
  startedAt: number;
  lastHeartbeat: number;
  validSeconds: number;
  pendingSeconds: number;
  usedNonces: Set<string>;
  recentScores: number[];
  recentIntervals: number[];
  streamStarted: boolean;
  onChainStarted: boolean;
  flagged: boolean;
  active: boolean;
  totalPaid: bigint;
}

export interface TickResult {
  sessionId: string;
  secondsElapsed: number;
  txHash: string;
  userAmount: bigint;
  publisherAmount: bigint;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
