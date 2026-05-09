/**
 * Wallet addresses are base58-encoded Solana pubkeys (e.g. `4Jp9E68g…`),
 * not 0x-prefixed EVM addresses. Campaign / session ids are hex strings of
 * the underlying 32-byte values.
 */
export interface VistaConfig {
  apiKey: string;
  /** Solana base58 pubkey of the connected user wallet */
  userWallet: string;
  /**
   * Optional static oracle node base URL(s). When provided, heartbeats fan
   * out to these in addition to whatever the dashboard discovery returns.
   * Most users should leave this empty and rely on `dashboardUrl` for
   * discovery — the trustless default.
   */
  oracleUrl?: string | string[];
  /**
   * Super-Dashboard base URL. The SDK periodically fetches
   * `${dashboardUrl}/api/oracle/active-nodes` and broadcasts to every active
   * oracle. Required for the trustless default; optional only when a static
   * `oracleUrl` is supplied.
   */
  dashboardUrl?: string;
  /** 32-byte hex (with or without 0x prefix) — the campaign PDA seed */
  campaignId: string;
  /**
   * Optional Solana base58 pubkey of the publisher payout wallet. When omitted
   * the oracle resolves it server-side from `apiKey` via the dashboard's
   * `/api/publishers/verify-apikey` lookup. Pass this only to override the
   * apiKey-derived default.
   */
  publisherWallet?: string;
  requireFullscreen?: boolean;
  /**
   * Optional id of a `<video>` element to track for `mediaProgress`. If
   * omitted, the SDK falls back to the first `<video>` it finds inside the
   * attached zone.
   */
  videoElementId?: string;
}

export interface AttentionSignals {
  visibility: number;
  tabFocused: boolean;
  mouseActive: boolean;
  scrolled: boolean;
  /** Coefficient of variation of pointer velocities over last 20 samples */
  pointerVelocityVariance: number;
  /** video.currentTime / duration ratio (0 if no video / before metadata) */
  mediaProgress: number;
  /** IdleDetector userState. 'active' = recent input; 'idle' = none for 60s */
  idleState: "active" | "idle";
  /** Coefficient of variation of inter-click intervals over last 10 clicks */
  clickRhythmVariance: number;
}

export interface HeartbeatPayload {
  sessionId: string;
  apiKey: string;
  userWallet: string;
  campaignId: string;
  /** Optional — oracle resolves from `apiKey` when missing. */
  publisherWallet?: string;
  timestamp: number;
  nonce: string;
  score: number;
  signals: AttentionSignals;
}

export interface HeartbeatResponse {
  valid: boolean;
  score: number;
  validSeconds: number;
  pendingSeconds: number;
  flagged: boolean;
  error?: string;
}

export interface EarnCallbackData {
  /** Total session amount in USDC (decimal, not raw u64) */
  sessionAmount: number;
  tickAmount: number;
  validSeconds: number;
  score: number;
  flagged: boolean;
}

export interface VistaStatus {
  active: boolean;
  sessionId: string | null;
  validSeconds: number;
  sessionAmount: number;
  score: number;
}

export interface OnboardingParams {
  /** Solana base58 pubkey of the user wallet */
  wallet: string;
  dashboardUrl?: string;
}
