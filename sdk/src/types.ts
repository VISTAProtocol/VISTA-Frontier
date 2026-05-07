/**
 * Wallet addresses are base58-encoded Solana pubkeys (e.g. `4Jp9E68g…`),
 * not 0x-prefixed EVM addresses. Campaign / session ids are hex strings of
 * the underlying 32-byte values.
 */
export interface VistaConfig {
  apiKey: string;
  /** Solana base58 pubkey of the connected user wallet */
  userWallet: string;
  oracleUrl: string;
  /** 32-byte hex (with or without 0x prefix) — the campaign PDA seed */
  campaignId: string;
  /** Solana base58 pubkey of the publisher payout wallet */
  publisherWallet: string;
  requireFullscreen?: boolean;
}

export interface AttentionSignals {
  visibility: number;
  tabFocused: boolean;
  mouseActive: boolean;
  scrolled: boolean;
}

export interface HeartbeatPayload {
  sessionId: string;
  apiKey: string;
  userWallet: string;
  campaignId: string;
  publisherWallet: string;
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
