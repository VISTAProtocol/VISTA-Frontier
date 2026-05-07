export interface VistaConfig {
  apiKey: string;
  userWallet: string;
  oracleUrl: string;
  campaignId: string;
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
  wallet: string;
  dashboardUrl?: string;
}
