interface VistaConfig {
  apiKey: string;
  userWallet: string;
  oracleUrl: string;
  campaignId: string;
  publisherWallet: string;
  requireFullscreen?: boolean;
}
interface AttentionSignals {
  visibility: number;
  tabFocused: boolean;
  mouseActive: boolean;
  scrolled: boolean;
}
interface HeartbeatPayload {
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
interface HeartbeatResponse {
  valid: boolean;
  score: number;
  validSeconds: number;
  pendingSeconds: number;
  flagged: boolean;
  error?: string;
}
interface EarnCallbackData {
  sessionAmount: number;
  tickAmount: number;
  validSeconds: number;
  score: number;
  flagged: boolean;
}
interface VistaStatus {
  active: boolean;
  sessionId: string | null;
  validSeconds: number;
  sessionAmount: number;
  score: number;
}
interface OnboardingParams {
  wallet: string;
  dashboardUrl?: string;
}
interface EarningOverlayParams {
  campaignTitle?: string;
  targetElement?: HTMLElement | null;
}

declare class Vista {
  private config;
  private collector;
  private sender;
  private sessionManager;
  private earnCallback;
  private sessionAmount;
  private lastValidSeconds;
  private lastScore;
  private isActive;
  private beforeunloadHandler;
  private visibilitychangeHandler;
  private listenersSetup;
  private isFullscreenActive;
  private fullscreenchangeHandler;
  private trackedElementId;
  private overlayIntervalId;
  private overlayFullscreenHandler;
  private overlayScrollHandler;
  init(config: VistaConfig): void;
  attachZone(elementId: string): void;
  detachZone(): void;
  onEarn(callback: (data: EarnCallbackData) => void): void;
  getStatus(): VistaStatus;
  showOnboardingModal(params: OnboardingParams): void;
  showEarningOverlay(params?: EarningOverlayParams): void;
  private removeEarningOverlay;
  private animateValue;
  private buildPayload;
  private handleResponse;
  private postSessionEnd;
  private setupFullscreenListener;
  private removeFullscreenListener;
  private checkIsFullscreen;
  private setupSessionEndListeners;
  private removeSessionEndListeners;
}
declare const vista: Vista;

declare const BASE_CHAIN_ID = 84532;
declare const BASE_RPC_URL = "https://sepolia.base.org";
declare const BASE_EXPLORER_URL = "https://sepolia.basescan.org";
interface WalletAuthMessageParams {
  domain: string;
  uri: string;
  address: string;
  nonce: string;
  chainId: number;
  issuedAt: string;
}
declare function buildWalletAuthMessage(
  params: WalletAuthMessageParams,
): string;
interface WalletSignInParams {
  address: string;
  chainId: number;
  targetChainId?: number;
  domain: string;
  uri: string;
  nonceEndpoint: string;
  verifyEndpoint: string;
  switchChain?: (chainId: number) => Promise<{
    id: number;
  }>;
  signMessage: (message: string) => Promise<string>;
}
declare function performWalletSignIn(params: WalletSignInParams): Promise<void>;

export {
  type AttentionSignals,
  type EarnCallbackData,
  type EarningOverlayParams,
  type HeartbeatPayload,
  type HeartbeatResponse,
  BASE_CHAIN_ID,
  BASE_EXPLORER_URL,
  BASE_RPC_URL,
  type OnboardingParams,
  vista as Vista,
  type VistaConfig,
  type VistaStatus,
  type WalletAuthMessageParams,
  type WalletSignInParams,
  buildWalletAuthMessage,
  performWalletSignIn,
};
