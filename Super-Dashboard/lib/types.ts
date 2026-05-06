export type RoleName = "advertiser" | "publisher" | "user"
export type PreferenceOption =
  | "tech"
  | "gaming"
  | "fashion"
  | "sport"
  | "food"
  | "healthy"
  | "finance"
  | "crypto"
  | "travel"
  | "music"
  | "automotive"
  | "beauty"
  | "education"
  | "entertainment"
  | "fitness"
  | "news"
  | "photography"
  | "real-estate"

export interface UserRecord {
  wallet_address: string
  age: number | null
  location: string | null
  preferences: PreferenceOption[] | null
  created_at: string
}

export interface PublisherRecord {
  id: string
  wallet_address: string
  platform_name: string
  api_key: string
  created_at: string
}

export interface AdvertiserRecord {
  id: string
  wallet_address: string
  company_name: string
  created_at: string
}

export interface CampaignRecord {
  id: string
  campaign_id_onchain: string
  advertiser_wallet: string
  title: string
  creative_url: string
  target_url: string
  total_budget: number
  remaining_budget: number
  rate_per_second: number
  target_preferences: PreferenceOption[] | null
  target_min_age: number | null
  target_max_age: number | null
  target_locations: string[] | null
  active: boolean
  chain: string
  created_at: string
}

export interface SessionRecord {
  id: string
  session_id_onchain: string
  campaign_id_onchain: string
  user_wallet: string
  publisher_wallet: string
  seconds_verified: number
  total_paid_usdc: number
  active: boolean
  started_at: string
  ended_at: string | null
}

export interface StreamTickRecord {
  id: string
  session_id_onchain: string
  user_wallet: string
  publisher_wallet: string
  user_amount: number
  publisher_amount: number
  total_amount: number
  seconds_elapsed: number
  block_timestamp: string
  created_at: string
}

export interface ReceiptRecord {
  id: string
  token_id: string
  session_id_onchain: string
  user_wallet: string
  advertiser_wallet: string
  campaign_id_onchain: string
  seconds_verified: number
  usdc_paid: number
  minted_at: string
}

export interface RegistrationStatus<T> {
  registered: boolean
  role: RoleName
  record: T | null
}

export interface DashboardMetricSet {
  label: string
  value: number
  helpText?: string
}

export interface CampaignListItem {
  id: string
  campaignIdOnchain: string
  title: string
  status: "active" | "ended"
  totalBudget: number
  remainingBudget: number
  totalViewers: number
  totalSecondsVerified: number
  totalUsdcSpent: number
  createdAt: string
}

export interface ChartPoint {
  date: string
  label: string
  value: number
  secondaryValue?: number
}

export interface SessionListItem {
  id: string
  sessionIdOnchain: string
  campaignIdOnchain: string
  campaignTitle?: string
  userWallet: string
  publisherWallet: string
  secondsVerified: number
  usdcPaid: number
  publisherAmount?: number
  startedAt: string
  endedAt: string | null
  status: "active" | "ended"
}

export interface AdvertiserDashboardData {
  stats: {
    activeCampaigns: number
    totalUsdcSpent: number
    totalVerifiedViewerSeconds: number
    averageConversionRate: number
  }
  campaigns: CampaignListItem[]
  viewersPerDay: ChartPoint[]
}

export interface CampaignAudienceAnalytics {
  preferenceBreakdown: Array<{ preference: string; count: number }>
  ageBreakdown: Array<{ range: string; count: number }>
  locationBreakdown: Array<{ location: string; count: number }>
}

export interface CampaignDetailData {
  campaign: CampaignRecord
  stats: {
    totalViewers: number
    totalSecondsVerified: number
    totalUsdcSpent: number
    remainingBudget: number
  }
  viewersPerDay: ChartPoint[]
  sessions: SessionListItem[]
  audienceAnalytics: CampaignAudienceAnalytics
}

export interface PublisherDashboardData {
  stats: {
    totalUsdcEarned: number
    totalAdImpressions: number
    totalViewerSeconds: number
    activeSessions: number
  }
  revenuePerDay: ChartPoint[]
  recentSessions: SessionListItem[]
}

export interface PublisherAnalyticsData {
  breakdownByCampaign: Array<{
    campaignIdOnchain: string
    campaignTitle: string
    revenue: number
    impressions: number
    viewerSeconds: number
  }>
  topTimeSlots: Array<{
    hour: number
    label: string
    revenue: number
  }>
  averageSessionDuration: number
}

export interface UserDashboardData {
  stats: {
    totalUsdcEarned: number
    totalSessionsCompleted: number
    totalSecondsVerified: number
    favoriteAdCategory: string
  }
  liveSession: {
    sessionId: string | null
    currentAmount: number
    sessionSeconds: number
    ratePerSecond: number
    verified: boolean
  }
  vault: {
    totalEarned: number
    totalWithdrawn: number
    availableBalance: number
  }
}

export interface UserHistoryData {
  sessions: Array<{
    date: string
    duration: number
    earned: number
    campaignTitle: string
    receiptUrl: string | null
  }>
  receipts: Array<{
    tokenId: string
    sessionIdOnchain: string
    usdcEarned: number
    secondsVerified: number
    mintedAt: string
    explorerUrl: string
  }>
}

export interface OracleTickPayload {
  sessionIdOnchain: string
  userWallet: string
  publisherWallet: string
  userAmount: number
  publisherAmount: number
  totalAmount: number
  secondsElapsed: number
  blockTimestamp: string
}

export interface OracleReceiptPayload {
  tokenId?: string
  sessionIdOnchain: string
  userWallet: string
  publisherWallet?: string
  advertiserWallet?: string
  campaignIdOnchain: string
  secondsVerified: number
  usdcPaid: number
  mintedAt: string
}

export interface LiveTickEvent {
  sessionId: string
  userWallet: string
  amount: number
  timestamp: string
  ratePerSecond?: number
  score?: number
  verified?: boolean
  sessionSeconds?: number
  secondsElapsed?: number
}

export interface ActiveCampaignResult {
  user: UserRecord | null
  campaigns: CampaignRecord[]
}

export interface VaultCreditRecord {
  id: string
  wallet_address: string
  session_id_onchain: string
  campaign_id_onchain: string
  amount: number
  role: number
  credited_at: string
}

export interface VaultWithdrawalRecord {
  id: string
  wallet_address: string
  amount: number
  withdrawn_at: string
}

export interface VaultBalanceData {
  totalEarned: number
  totalWithdrawn: number
  availableBalance: number
  credits: VaultCreditRecord[]
  withdrawals: VaultWithdrawalRecord[]
}

export interface UserEarningsData {
  totalEarned: number
  totalSessions: number
  totalSeconds: number
  recentTicks: StreamTickRecord[]
}
