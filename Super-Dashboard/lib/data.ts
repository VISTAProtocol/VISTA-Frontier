import { roleMeta } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  ActiveCampaignResult,
  AttentionScoreBreakdown,
  AttentionScoreResult,
  AdvertiserDashboardData,
  AdvertiserRecord,
  CampaignAudienceAnalytics,
  CampaignDetailData,
  CampaignListItem,
  CampaignRecord,
  ChartPoint,
  OracleReceiptPayload,
  OracleTickPayload,
  PreferenceOption,
  PublisherAnalyticsData,
  PublisherDashboardData,
  PublisherRecord,
  ReceiptRecord,
  RegistrationStatus,
  RoleName,
  SessionListItem,
  SessionRecord,
  StreamTickRecord,
  UserDashboardData,
  UserEarningsData,
  UserHistoryData,
  UserRecord,
  VaultBalanceData,
  VaultCreditRecord,
  VaultWithdrawalRecord,
} from "@/lib/types";
import {
  average,
  buildExplorerUrl,
  buildVistaPublisherApiKey,
  dayKey,
  formatDateShort,
  formatHourLabel,
  normalizeWallet,
  safeNumber,
  sumNumbers,
} from "@/lib/utils";

type RoleRecord = AdvertiserRecord | PublisherRecord | UserRecord;

const nowIso = () => new Date().toISOString();
const ATTENTION_SECONDS_TARGET = 3600;
const ATTENTION_CATEGORY_TARGET = 5;
const ATTENTION_CONSISTENCY_MIN_SECONDS = 5;
const ATTENTION_SCORE_WEIGHTS = {
  totalSeconds: 0.45,
  consistency: 0.25,
  categoryDiversity: 0.2,
  antiBot: 0.1,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeCampaign(row: Record<string, unknown>): CampaignRecord {
  return {
    id: String(row.id),
    campaign_id_onchain: String(row.campaign_id_onchain),
    advertiser_wallet: normalizeWallet(String(row.advertiser_wallet)),
    title: String(row.title),
    creative_url: String(row.creative_url),
    target_url: String(row.target_url),
    total_budget: safeNumber(row.total_budget as string | number),
    remaining_budget: safeNumber(row.remaining_budget as string | number),
    rate_per_second: safeNumber(row.rate_per_second as string | number),
    target_preferences:
      (row.target_preferences as PreferenceOption[] | null) ?? null,
    target_min_age:
      row.target_min_age == null ? null : Number(row.target_min_age),
    target_max_age:
      row.target_max_age == null ? null : Number(row.target_max_age),
    target_locations: (row.target_locations as string[] | null) ?? null,
    active: Boolean(row.active),
    chain: String(row.chain ?? 'base-sepolia'),
    created_at: String(row.created_at),
    source_chain: (row.source_chain as CampaignRecord["source_chain"]) ?? null,
    advertiser_evm_address:
      row.advertiser_evm_address == null
        ? null
        : String(row.advertiser_evm_address),
    bridge_status:
      (row.bridge_status as CampaignRecord["bridge_status"]) ?? "native",
    cctp_nonce: row.cctp_nonce == null ? null : Number(row.cctp_nonce),
    source_chain_tx_hash:
      row.source_chain_tx_hash == null
        ? null
        : String(row.source_chain_tx_hash),
    lz_message_hash:
      row.lz_message_hash == null ? null : String(row.lz_message_hash),
    bridged_at: row.bridged_at == null ? null : String(row.bridged_at),
  };
}

function normalizeSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    session_id_onchain: String(row.session_id_onchain),
    campaign_id_onchain: String(row.campaign_id_onchain),
    user_wallet: normalizeWallet(String(row.user_wallet)),
    publisher_wallet: normalizeWallet(String(row.publisher_wallet)),
    seconds_verified: Number(row.seconds_verified ?? 0),
    total_paid_usdc: safeNumber(row.total_paid_usdc as string | number),
    active: Boolean(row.active),
    started_at: String(row.started_at),
    ended_at: row.ended_at ? String(row.ended_at) : null,
  };
}

function normalizeTick(row: Record<string, unknown>): StreamTickRecord {
  return {
    id: String(row.id),
    session_id_onchain: String(row.session_id_onchain),
    user_wallet: normalizeWallet(String(row.user_wallet)),
    publisher_wallet: normalizeWallet(String(row.publisher_wallet)),
    user_amount: safeNumber(row.user_amount as string | number),
    publisher_amount: safeNumber(row.publisher_amount as string | number),
    validator_amount: safeNumber(row.validator_amount as string | number),
    vista_amount: safeNumber(row.vista_amount as string | number),
    total_amount: safeNumber(row.total_amount as string | number),
    seconds_elapsed: Number(row.seconds_elapsed ?? 0),
    block_timestamp: String(row.block_timestamp),
    created_at: String(row.created_at),
  };
}

function normalizeReceipt(row: Record<string, unknown>): ReceiptRecord {
  return {
    id: String(row.id),
    token_id: String(row.token_id),
    session_id_onchain: String(row.session_id_onchain),
    user_wallet: normalizeWallet(String(row.user_wallet)),
    advertiser_wallet: normalizeWallet(String(row.advertiser_wallet)),
    campaign_id_onchain: String(row.campaign_id_onchain),
    chain: String(row.chain ?? 'base-sepolia'),
    chain_id: row.chain_id == null ? null : Number(row.chain_id),
    platform: row.platform ? String(row.platform) : null,
    seconds_verified: Number(row.seconds_verified ?? 0),
    usdc_paid: safeNumber(row.usdc_paid as string | number),
    minted_at: String(row.minted_at),
  };
}

function toCampaignListItem(
  campaign: CampaignRecord,
  sessions: SessionRecord[],
): CampaignListItem {
  const matchingSessions = sessions.filter(
    (session) => session.campaign_id_onchain === campaign.campaign_id_onchain,
  );

  return {
    id: campaign.id,
    campaignIdOnchain: campaign.campaign_id_onchain,
    title: campaign.title,
    status: campaign.active ? "active" : "ended",
    totalBudget: campaign.total_budget,
    remainingBudget: campaign.remaining_budget,
    totalViewers: matchingSessions.length,
    totalSecondsVerified: sumNumbers(
      matchingSessions.map((session) => session.seconds_verified),
    ),
    totalUsdcSpent: sumNumbers(
      matchingSessions.map((session) => session.total_paid_usdc),
    ),
    createdAt: campaign.created_at,
  };
}

function toSessionListItem(
  session: SessionRecord,
  campaigns: CampaignRecord[],
  ticks: StreamTickRecord[],
): SessionListItem {
  const matchingCampaign = campaigns.find(
    (campaign) => campaign.campaign_id_onchain === session.campaign_id_onchain,
  );
  const matchingTicks = ticks.filter(
    (tick) => tick.session_id_onchain === session.session_id_onchain,
  );

  return {
    id: session.id,
    sessionIdOnchain: session.session_id_onchain,
    campaignIdOnchain: session.campaign_id_onchain,
    campaignTitle: matchingCampaign?.title,
    userWallet: session.user_wallet,
    publisherWallet: session.publisher_wallet,
    secondsVerified: session.seconds_verified,
    usdcPaid: session.total_paid_usdc,
    publisherAmount: sumNumbers(
      matchingTicks.map((tick) => tick.publisher_amount),
    ),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    status: session.active ? "active" : "ended",
  };
}

function buildDaySeries(
  values: Array<{ date: string; value: number; secondaryValue?: number }>,
): ChartPoint[] {
  const grouped = new Map<string, { value: number; secondaryValue: number }>();

  for (const entry of values) {
    const key = dayKey(entry.date);
    const current = grouped.get(key) ?? { value: 0, secondaryValue: 0 };
    current.value += entry.value;
    current.secondaryValue += entry.secondaryValue ?? 0;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, summary]) => ({
      date,
      label: formatDateShort(date),
      value: summary.value,
      secondaryValue: summary.secondaryValue || undefined,
    }));
}

function campaignMatchesUser(
  campaign: CampaignRecord,
  user: UserRecord | null,
) {
  if (!user) return true;

  const userPreferences = user.preferences ?? [];
  const userLocation = user.location?.toLowerCase();
  const hasPreferenceTarget =
    Array.isArray(campaign.target_preferences) &&
    campaign.target_preferences.length > 0;
  const hasLocationTarget =
    Array.isArray(campaign.target_locations) &&
    campaign.target_locations.length > 0;

  const matchesPreferences = !hasPreferenceTarget
    ? true
    : campaign.target_preferences!.some((preference) =>
        userPreferences.includes(preference),
      );

  const matchesLocation = !hasLocationTarget
    ? true
    : campaign.target_locations!.some(
        (location) => location.toLowerCase() === userLocation,
      );

  const matchesAge =
    user.age == null
      ? true
      : (campaign.target_min_age == null ||
          user.age >= campaign.target_min_age) &&
        (campaign.target_max_age == null ||
          user.age <= campaign.target_max_age);

  return matchesPreferences && matchesLocation && matchesAge;
}

async function selectRoleRecord<T extends RoleRecord>(
  role: RoleName,
  wallet: string,
): Promise<T | null> {
  const normalizedWallet = normalizeWallet(wallet);
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  if (role === "oracle") {
    // Oracle registration lives in oracle_nodes (keyed by Solana pubkey, not
    // EVM wallet). Resolve via /api/oracle/status — not via this helper.
    return null;
  }
  const table =
    role === "user"
      ? "users"
      : role === "publisher"
        ? "publishers"
        : "advertisers";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("wallet_address", normalizedWallet)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as T | null) ?? null;
}

async function selectCampaignsByWallet(wallet: string) {
  const normalizedWallet = normalizeWallet(wallet);
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("advertiser_wallet", normalizedWallet)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    normalizeCampaign(row as Record<string, unknown>),
  );
}

async function selectAllCampaigns(): Promise<CampaignRecord[]> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    normalizeCampaign(row as Record<string, unknown>),
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function selectCampaignById(id: string) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  if (UUID_PATTERN.test(id)) {
    const direct = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (direct.error) {
      throw new Error(direct.error.message);
    }
    if (direct.data) {
      return normalizeCampaign(direct.data as Record<string, unknown>);
    }
  }

  const onchain = await supabase
    .from("campaigns")
    .select("*")
    .eq("campaign_id_onchain", id)
    .maybeSingle();

  if (onchain.error) {
    throw new Error(onchain.error.message);
  }

  return onchain.data
    ? normalizeCampaign(onchain.data as Record<string, unknown>)
    : null;
}

async function selectSessions(filters?: {
  campaignIds?: string[];
  campaignIdOnchain?: string;
  publisherWallet?: string;
  userWallet?: string;
}) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }
  console.log("SESSIONS");

  let query = supabase
    .from("sessions")
    .select("*")
    .order("started_at", { ascending: false });

  if (filters?.campaignIds?.length) {
    query = query.in("campaign_id_onchain", filters.campaignIds);
  }

  if (filters?.campaignIdOnchain) {
    query = query.eq("campaign_id_onchain", filters.campaignIdOnchain);
  }

  if (filters?.publisherWallet) {
    query = query.eq(
      "publisher_wallet",
      normalizeWallet(filters.publisherWallet),
    );
  }

  if (filters?.userWallet) {
    query = query.eq("user_wallet", normalizeWallet(filters.userWallet));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    normalizeSession(row as Record<string, unknown>),
  );
}

async function selectTicks(filters?: {
  publisherWallet?: string;
  userWallet?: string;
  sessionIds?: string[];
}) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  let query = supabase
    .from("stream_ticks")
    .select("*")
    .order("block_timestamp", { ascending: false });

  if (filters?.publisherWallet) {
    query = query.eq(
      "publisher_wallet",
      normalizeWallet(filters.publisherWallet),
    );
  }

  if (filters?.userWallet) {
    query = query.eq("user_wallet", normalizeWallet(filters.userWallet));
  }

  if (filters?.sessionIds?.length) {
    query = query.in("session_id_onchain", filters.sessionIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    normalizeTick(row as Record<string, unknown>),
  );
}

async function selectUsersByWallets(wallets: string[]): Promise<UserRecord[]> {
  if (!wallets.length) return [];
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not configured");

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("wallet_address", wallets);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    wallet_address: normalizeWallet(String(row.wallet_address)),
    age: row.age != null ? Number(row.age) : null,
    location: row.location ? String(row.location) : null,
    preferences: (row.preferences as PreferenceOption[] | null) ?? null,
    created_at: String(row.created_at),
  }));
}

function buildAudienceAnalytics(
  users: UserRecord[],
): CampaignAudienceAnalytics {
  const prefCounts = new Map<string, number>();
  for (const user of users) {
    for (const pref of user.preferences ?? []) {
      prefCounts.set(pref, (prefCounts.get(pref) ?? 0) + 1);
    }
  }

  const ageBuckets: Record<string, number> = {
    "Under 18": 0,
    "18–24": 0,
    "25–34": 0,
    "35–44": 0,
    "45–54": 0,
    "55+": 0,
  };
  for (const user of users) {
    if (user.age == null) continue;
    if (user.age < 18) ageBuckets["Under 18"]++;
    else if (user.age <= 24) ageBuckets["18–24"]++;
    else if (user.age <= 34) ageBuckets["25–34"]++;
    else if (user.age <= 44) ageBuckets["35–44"]++;
    else if (user.age <= 54) ageBuckets["45–54"]++;
    else ageBuckets["55+"]++;
  }

  const locCounts = new Map<string, number>();
  for (const user of users) {
    if (user.location) {
      locCounts.set(user.location, (locCounts.get(user.location) ?? 0) + 1);
    }
  }

  return {
    preferenceBreakdown: Array.from(prefCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([preference, count]) => ({ preference, count })),
    ageBreakdown: Object.entries(ageBuckets)
      .filter(([, count]) => count > 0)
      .map(([range, count]) => ({ range, count })),
    locationBreakdown: Array.from(locCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([location, count]) => ({ location, count })),
  };
}

async function selectReceipts(userWallet?: string) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  let query = supabase
    .from("receipts")
    .select("*")
    .order("minted_at", { ascending: false });

  if (userWallet) {
    query = query.eq("user_wallet", normalizeWallet(userWallet));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    normalizeReceipt(row as Record<string, unknown>),
  );
}

async function countReceiptsByCampaignIds(campaignIds: string[]) {
  if (!campaignIds.length) {
    return 0;
  }

  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { count, error } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .in("campaign_id_onchain", campaignIds);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getRegistrationStatus(
  role: RoleName,
  wallet: string,
): Promise<
  RegistrationStatus<UserRecord | PublisherRecord | AdvertiserRecord>
> {
  const record = await selectRoleRecord(role, wallet);

  return {
    registered: Boolean(record),
    role,
    record,
  };
}

export async function createUser(input: {
  walletAddress: string;
  age: number | null;
  location: string | null;
  preferences: PreferenceOption[];
}) {
  const normalizedWallet = normalizeWallet(input.walletAddress);
  const payload: UserRecord = {
    wallet_address: normalizedWallet,
    age: input.age,
    location: input.location?.trim() || null,
    preferences: input.preferences.length ? input.preferences : null,
    created_at: nowIso(),
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "wallet_address" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserRecord;
}

export async function getUser(wallet: string) {
  return selectRoleRecord<UserRecord>("user", wallet);
}

export async function createPublisher(input: {
  walletAddress: string;
  platformName: string;
}) {
  const normalizedWallet = normalizeWallet(input.walletAddress);
  const supabase = createServerSupabaseClient();
  const payload: PublisherRecord = {
    id: crypto.randomUUID(),
    wallet_address: normalizedWallet,
    platform_name: input.platformName.trim(),
    api_key: buildVistaPublisherApiKey(),
    created_at: nowIso(),
  };

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("publishers")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PublisherRecord;
}

export async function getPublishersByWallet(
  wallet: string,
): Promise<PublisherRecord[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not configured");

  const { data, error } = await supabase
    .from("publishers")
    .select("*")
    .eq("wallet_address", normalizeWallet(wallet))
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PublisherRecord[];
}

export async function createAdvertiser(input: {
  walletAddress: string;
  companyName: string;
}) {
  const normalizedWallet = normalizeWallet(input.walletAddress);
  const supabase = createServerSupabaseClient();
  const payload: AdvertiserRecord = {
    id: crypto.randomUUID(),
    wallet_address: normalizedWallet,
    company_name: input.companyName.trim(),
    created_at: nowIso(),
  };

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("advertisers")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AdvertiserRecord;
}

export async function createCampaign(input: {
  campaignIdOnchain: string;
  advertiserWallet: string;
  title: string;
  creativeUrl: string;
  targetUrl: string;
  totalBudget: number;
  ratePerSecond: number;
  targetPreferences: PreferenceOption[];
  targetMinAge: number | null;
  targetMaxAge: number | null;
  targetLocations: string[];
  chain?: string;
  // Cross-chain advertiser deposit fields. When omitted, the row is a
  // native Solana campaign (bridge_status defaults to 'native' on the DB).
  sourceChain?: CampaignRecord["source_chain"];
  advertiserEvmAddress?: string | null;
  bridgeStatus?: CampaignRecord["bridge_status"];
  cctpNonce?: number | null;
  sourceChainTxHash?: string | null;
} = {} as never) {
  const payload: CampaignRecord = {
    id: crypto.randomUUID(),
    campaign_id_onchain: input.campaignIdOnchain,
    advertiser_wallet: normalizeWallet(input.advertiserWallet),
    title: input.title.trim(),
    creative_url: input.creativeUrl.trim(),
    target_url: input.targetUrl.trim(),
    total_budget: input.totalBudget,
    remaining_budget: input.totalBudget,
    rate_per_second: input.ratePerSecond,
    target_preferences: input.targetPreferences.length
      ? input.targetPreferences
      : null,
    target_min_age: input.targetMinAge,
    target_max_age: input.targetMaxAge,
    target_locations: input.targetLocations.length
      ? input.targetLocations
      : null,
    active: true,
    chain: input.chain || process.env.NEXT_PUBLIC_VISTA_CHAIN || 'base-sepolia',
    created_at: nowIso(),
    source_chain: input.sourceChain ?? "solana-devnet",
    advertiser_evm_address: input.advertiserEvmAddress ?? null,
    bridge_status: input.bridgeStatus ?? "native",
    cctp_nonce: input.cctpNonce ?? null,
    source_chain_tx_hash: input.sourceChainTxHash ?? null,
    lz_message_hash: null,
    bridged_at: null,
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  // Race condition: advertiser launches campaign → on-chain deposit_campaign
  // emits CampaignCreated → oracle eventListener forwards to /api/oracle/sync
  // → applyOracleSyncEvent upserts a placeholder row ("(synced from chain)")
  // BEFORE the frontend gets to POST /api/campaigns. A plain .insert() would
  // collide on `campaign_id_onchain`. Upsert + onConflict lets the
  // advertiser-supplied fields (title, creative, targeting) overwrite the
  // placeholder — the sync handler's row is just a stub anyway.
  const { data, error } = await supabase
    .from("campaigns")
    .upsert(payload, { onConflict: "campaign_id_onchain" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeCampaign(data as Record<string, unknown>);
}

export type BridgeStatusUpdate = Partial<
  Pick<
    CampaignRecord,
    | "bridge_status"
    | "cctp_nonce"
    | "source_chain_tx_hash"
    | "lz_message_hash"
    | "bridged_at"
    | "advertiser_evm_address"
    | "source_chain"
  >
>;

/// Update bridge-status fields on an existing campaign row keyed by the
/// on-chain campaign id (the bytes32 from the EVM event). Returns the
/// updated row, or null if no campaign with that id exists.
export async function updateCampaignBridgeStatus(
  campaignIdOnchain: string,
  updates: BridgeStatusUpdate,
) {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not configured");

  const { data, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("campaign_id_onchain", campaignIdOnchain.toLowerCase())
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizeCampaign(data as Record<string, unknown>) : null;
}

export async function getCampaignBridgeStatus(campaignIdOnchain: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not configured");

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "campaign_id_onchain, source_chain, bridge_status, cctp_nonce, source_chain_tx_hash, lz_message_hash, bridged_at, advertiser_evm_address, advertiser_wallet, total_budget, created_at, active",
    )
    .eq("campaign_id_onchain", campaignIdOnchain.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listCampaignsByAdvertiser(wallet: string) {
  const campaigns = await selectCampaignsByWallet(wallet);
  const sessions = await selectSessions({
    campaignIds: campaigns.map((campaign) => campaign.campaign_id_onchain),
  });

  return campaigns.map((campaign) => toCampaignListItem(campaign, sessions));
}

export async function updateCampaignById(
  id: string,
  updates: Partial<Pick<CampaignRecord, "active" | "remaining_budget">>,
) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeCampaign(data as Record<string, unknown>) : null;
}

export async function getAdvertiserDashboard(
  wallet: string,
): Promise<AdvertiserDashboardData> {
  const campaigns = await selectCampaignsByWallet(wallet);
  const campaignIds = campaigns.map((campaign) => campaign.campaign_id_onchain);
  const [sessions, totalReceipts] = await Promise.all([
    selectSessions({ campaignIds }),
    countReceiptsByCampaignIds(campaignIds),
  ]);

  const averageConversionRate =
    sessions.length === 0
      ? 0
      : Number(((totalReceipts / sessions.length) * 100).toFixed(2));

  const stats = {
    activeCampaigns: campaigns.filter((campaign) => campaign.active).length,
    totalUsdcSpent: sumNumbers(
      sessions.map((session) => session.total_paid_usdc),
    ),
    totalVerifiedViewerSeconds: sumNumbers(
      sessions.map((session) => session.seconds_verified),
    ),
    averageConversionRate,
  };

  return {
    stats,
    campaigns: campaigns.map((campaign) =>
      toCampaignListItem(campaign, sessions),
    ),
    viewersPerDay: buildDaySeries(
      sessions.map((session) => ({
        date: session.started_at,
        value: 1,
        secondaryValue: session.total_paid_usdc,
      })),
    ),
  };
}

export async function getCampaignDetail(
  id: string,
): Promise<CampaignDetailData | null> {
  const campaign = await selectCampaignById(id);

  if (!campaign) {
    return null;
  }

  const sessions = await selectSessions({
    campaignIdOnchain: campaign.campaign_id_onchain,
  });
  const [ticks, viewers] = await Promise.all([
    selectTicks({
      sessionIds: sessions.map((session) => session.session_id_onchain),
    }),
    selectUsersByWallets(
      Array.from(new Set(sessions.map((session) => session.user_wallet))),
    ),
  ]);

  return {
    campaign,
    stats: {
      totalViewers: sessions.length,
      totalSecondsVerified: sumNumbers(
        sessions.map((session) => session.seconds_verified),
      ),
      totalUsdcSpent: sumNumbers(
        sessions.map((session) => session.total_paid_usdc),
      ),
      remainingBudget: campaign.remaining_budget,
    },
    viewersPerDay: buildDaySeries(
      sessions.map((session) => ({
        date: session.started_at,
        value: 1,
        secondaryValue: session.total_paid_usdc,
      })),
    ),
    sessions: sessions.map((session) =>
      toSessionListItem(session, [campaign], ticks),
    ),
    audienceAnalytics: buildAudienceAnalytics(viewers),
  };
}

export async function getPublisherDashboard(
  wallet: string,
): Promise<PublisherDashboardData> {
  const sessions = await selectSessions({ publisherWallet: wallet });
  const ticks = await selectTicks({ publisherWallet: wallet });
  const campaigns = await Promise.all(
    Array.from(
      new Set(sessions.map((session) => session.campaign_id_onchain)),
    ).map((id) => selectCampaignById(id)),
  );

  return {
    stats: {
      totalUsdcEarned: sumNumbers(ticks.map((tick) => tick.publisher_amount)),
      totalAdImpressions: sessions.length,
      totalViewerSeconds: sumNumbers(
        sessions.map((session) => session.seconds_verified),
      ),
      activeSessions: sessions.filter((session) => session.active).length,
    },
    revenuePerDay: buildDaySeries(
      ticks.map((tick) => ({
        date: tick.block_timestamp,
        value: tick.publisher_amount,
      })),
    ),
    recentSessions: sessions
      .slice(0, 6)
      .map((session) =>
        toSessionListItem(
          session,
          campaigns.filter(Boolean) as CampaignRecord[],
          ticks,
        ),
      ),
  };
}

export async function getPublisherAnalytics(
  wallet: string,
): Promise<PublisherAnalyticsData> {
  const [sessions, ticks, allCampaigns] = await Promise.all([
    selectSessions({ publisherWallet: wallet }),
    selectTicks({ publisherWallet: wallet }),
    selectAllCampaigns(),
  ]);

  const breakdownMap = new Map<
    string,
    { revenue: number; impressions: number; viewerSeconds: number }
  >();

  for (const session of sessions) {
    const current = breakdownMap.get(session.campaign_id_onchain) ?? {
      revenue: 0,
      impressions: 0,
      viewerSeconds: 0,
    };

    current.impressions += 1;
    current.viewerSeconds += session.seconds_verified;
    current.revenue += sumNumbers(
      ticks
        .filter(
          (tick) => tick.session_id_onchain === session.session_id_onchain,
        )
        .map((tick) => tick.publisher_amount),
    );

    breakdownMap.set(session.campaign_id_onchain, current);
  }

  const topTimeSlots = Array.from(
    ticks.reduce((accumulator, tick) => {
      const hour = new Date(tick.block_timestamp).getHours();
      accumulator.set(
        hour,
        (accumulator.get(hour) ?? 0) + tick.publisher_amount,
      );
      return accumulator;
    }, new Map<number, number>()),
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([hour, revenue]) => ({
      hour,
      label: formatHourLabel(hour),
      revenue,
    }));

  return {
    breakdownByCampaign: allCampaigns.map((campaign) => ({
      campaignIdOnchain: campaign.campaign_id_onchain,
      campaignTitle: campaign.title,
      ...(breakdownMap.get(campaign.campaign_id_onchain) ?? {
        revenue: 0,
        impressions: 0,
        viewerSeconds: 0,
      }),
    })),
    topTimeSlots,
    averageSessionDuration: average(
      sessions.map((session) => session.seconds_verified),
    ),
  };
}

export async function createSession(input: {
  sessionIdOnchain: string;
  campaignIdOnchain: string;
  userWallet: string;
  publisherWallet: string;
}) {
  const payload: SessionRecord = {
    id: crypto.randomUUID(),
    session_id_onchain: input.sessionIdOnchain,
    campaign_id_onchain: input.campaignIdOnchain,
    user_wallet: normalizeWallet(input.userWallet),
    publisher_wallet: normalizeWallet(input.publisherWallet),
    seconds_verified: 0,
    total_paid_usdc: 0,
    active: true,
    started_at: nowIso(),
    ended_at: null,
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("sessions")
    .upsert(payload, {
      onConflict: "session_id_onchain",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    // Session already exists (duplicate from oracle + ponder both firing) — fetch the existing one
    const existing = await supabase
      .from("sessions")
      .select("*")
      .eq("session_id_onchain", payload.session_id_onchain)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    return normalizeSession(existing.data as Record<string, unknown>);
  }

  return normalizeSession(data as Record<string, unknown>);
}

export async function recordTick(payload: OracleTickPayload) {
  const fallbackValidator = payload.totalAmount * 0.10;
  const fallbackVista =
    payload.totalAmount -
    payload.userAmount -
    payload.publisherAmount -
    fallbackValidator;
  const tickRecord: StreamTickRecord = {
    id: crypto.randomUUID(),
    session_id_onchain: payload.sessionIdOnchain,
    user_wallet: normalizeWallet(payload.userWallet),
    publisher_wallet: normalizeWallet(payload.publisherWallet),
    user_amount: payload.userAmount,
    publisher_amount: payload.publisherAmount,
    validator_amount: payload.validatorAmount ?? fallbackValidator,
    vista_amount: payload.vistaAmount ?? Math.max(0, fallbackVista),
    total_amount: payload.totalAmount,
    seconds_elapsed: payload.secondsElapsed,
    block_timestamp: payload.blockTimestamp,
    created_at: nowIso(),
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  // Deduplicate: Oracle and Ponder both call this endpoint for the same on-chain tick.
  // Return early if a tick for this session already exists within a 30-second window.
  // Use .limit(1) instead of .maybeSingle() because multiple ticks can land in the window.
  const blockTs = new Date(payload.blockTimestamp).getTime();
  const dupCheck = await supabase
    .from("stream_ticks")
    .select("*")
    .eq("session_id_onchain", tickRecord.session_id_onchain)
    .gte("block_timestamp", new Date(blockTs - 30_000).toISOString())
    .lte("block_timestamp", new Date(blockTs + 30_000).toISOString())
    .limit(1);

  if (dupCheck.error) throw new Error(dupCheck.error.message);
  if (dupCheck.data && dupCheck.data.length > 0)
    return normalizeTick(dupCheck.data[0] as Record<string, unknown>);

  const sessionQuery = await supabase
    .from("sessions")
    .select("*")
    .eq("session_id_onchain", payload.sessionIdOnchain)
    .maybeSingle();

  if (sessionQuery.error) {
    throw new Error(sessionQuery.error.message);
  }

  const session = sessionQuery.data
    ? normalizeSession(sessionQuery.data as Record<string, unknown>)
    : null;

  const insertedTick = await supabase
    .from("stream_ticks")
    .insert(tickRecord)
    .select("*")
    .single();
  if (insertedTick.error) {
    throw new Error(insertedTick.error.message);
  }

  if (session) {
    const updatedSession = await supabase
      .from("sessions")
      .update({
        seconds_verified: session.seconds_verified + payload.secondsElapsed,
        total_paid_usdc: session.total_paid_usdc + payload.totalAmount,
      })
      .eq("session_id_onchain", payload.sessionIdOnchain);

    if (updatedSession.error) {
      throw new Error(updatedSession.error.message);
    }

    const campaignQuery = await supabase
      .from("campaigns")
      .select("*")
      .eq("campaign_id_onchain", session.campaign_id_onchain)
      .maybeSingle();

    if (campaignQuery.error) {
      throw new Error(campaignQuery.error.message);
    }

    if (campaignQuery.data) {
      const campaign = normalizeCampaign(
        campaignQuery.data as Record<string, unknown>,
      );
      const nextBudget = Math.max(
        0,
        campaign.remaining_budget - payload.totalAmount,
      );

      const updatedCampaign = await supabase
        .from("campaigns")
        .update({
          remaining_budget: nextBudget,
          active: nextBudget > 0,
        })
        .eq("campaign_id_onchain", campaign.campaign_id_onchain);

      if (updatedCampaign.error) {
        throw new Error(updatedCampaign.error.message);
      }
    }
  }

  return normalizeTick(insertedTick.data as Record<string, unknown>);
}

export async function createReceipt(payload: OracleReceiptPayload) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  let advertiserWallet = payload.advertiserWallet ?? "";
  let chain = payload.chain ?? "";
  if (payload.chainId != null && !Number.isNaN(payload.chainId)) {
    if (!chain && payload.chainId === 84532) {
      chain = "base-sepolia";
    }
  }
  if (!advertiserWallet) {
    const campaignRow = await supabase
      .from("campaigns")
      .select("advertiser_wallet, chain")
      .eq("campaign_id_onchain", payload.campaignIdOnchain)
      .maybeSingle();
    advertiserWallet =
      ((campaignRow.data as Record<string, unknown> | null)
        ?.advertiser_wallet as string) ?? "";
    if (!chain) {
      chain =
        ((campaignRow.data as Record<string, unknown> | null)?.chain as string) ??
        "";
    }
  }

  const defaultChain =
    process.env.NEXT_PUBLIC_VISTA_CHAIN || "base-sepolia";
  chain = chain || defaultChain;

  const chainIdMap: Record<string, number> = {
    "base-sepolia": 84532,
    base: 8453,
  };
  const chainId = payload.chainId ?? chainIdMap[chain] ?? null;

  let platform = payload.platform ?? "";
  const normalizedPublisherWallet = payload.publisherWallet
    ? normalizeWallet(payload.publisherWallet)
    : "";
  if (!platform && normalizedPublisherWallet) {
    const publisherRow = await supabase
      .from("publishers")
      .select("platform_name")
      .eq("wallet_address", normalizedPublisherWallet)
      .maybeSingle();
    platform =
      ((publisherRow.data as Record<string, unknown> | null)
        ?.platform_name as string) ?? "";
  }
  const platformNormalized = platform.trim().toLowerCase();

  // Query stream_ticks to get breakdown of amounts
  const ticksQuery = await supabase
    .from("stream_ticks")
    .select("user_amount, publisher_amount")
    .eq("session_id_onchain", payload.sessionIdOnchain);

  if (ticksQuery.error) {
    throw new Error(ticksQuery.error.message);
  }

  const ticks =
    (ticksQuery.data as Array<{
      user_amount: number;
      publisher_amount: number;
    }>) ?? [];
  const totalUserAmount = ticks.reduce((sum, t) => sum + t.user_amount, 0);
  const totalPublisherAmount = ticks.reduce(
    (sum, t) => sum + t.publisher_amount,
    0,
  );

  // Fallback: if no ticks exist in DB yet (race condition or decoding failure),
  // derive vault credit amounts from the oracle-reported usdcPaid using the
  // protocol split: 30% user / 50% publisher / 10% validators / 10% VISTA.
  const effectiveUserAmount =
    totalUserAmount > 0 ? totalUserAmount : payload.usdcPaid * 0.30;
  const effectivePublisherAmount =
    totalPublisherAmount > 0 ? totalPublisherAmount : payload.usdcPaid * 0.50;

  const receipt: ReceiptRecord = {
    id: crypto.randomUUID(),
    token_id: payload.tokenId ?? crypto.randomUUID(),
    session_id_onchain: payload.sessionIdOnchain,
    user_wallet: normalizeWallet(payload.userWallet),
    advertiser_wallet: normalizeWallet(advertiserWallet),
    campaign_id_onchain: payload.campaignIdOnchain,
    chain,
    chain_id: chainId,
    platform: platformNormalized || null,
    seconds_verified: payload.secondsVerified,
    usdc_paid: payload.usdcPaid,
    minted_at: payload.mintedAt,
  };

  const { data: receiptData, error: receiptError } = await supabase
    .from("receipts")
    .insert(receipt)
    .select("*")
    .single();

  if (receiptError) {
    throw new Error(receiptError.message);
  }

  // Create vault credits for user
  if (effectiveUserAmount > 0) {
    const userCredit: VaultCreditRecord = {
      id: crypto.randomUUID(),
      wallet_address: normalizeWallet(payload.userWallet),
      session_id_onchain: payload.sessionIdOnchain,
      campaign_id_onchain: payload.campaignIdOnchain,
      amount: effectiveUserAmount,
      role: 0, // user
      credited_at: payload.mintedAt,
    };
    const { error: userCreditError } = await supabase
      .from("vault_credits")
      .insert(userCredit);
    if (userCreditError) {
      throw new Error(
        `Failed to create user vault credit: ${userCreditError.message}`,
      );
    }
  }

  // Create vault credits for publisher
  if (effectivePublisherAmount > 0) {
    const publisherCredit: VaultCreditRecord = {
      id: crypto.randomUUID(),
      wallet_address: normalizeWallet(payload.publisherWallet),
      session_id_onchain: payload.sessionIdOnchain,
      campaign_id_onchain: payload.campaignIdOnchain,
      amount: effectivePublisherAmount,
      role: 1, // publisher
      credited_at: payload.mintedAt,
    };
    const { error: publisherCreditError } = await supabase
      .from("vault_credits")
      .insert(publisherCredit);
    if (publisherCreditError) {
      throw new Error(
        `Failed to create publisher vault credit: ${publisherCreditError.message}`,
      );
    }
  }

  const sessionUpdate = await supabase
    .from("sessions")
    .update({
      active: false,
      ended_at: payload.mintedAt,
      seconds_verified: payload.secondsVerified,
      total_paid_usdc: payload.usdcPaid,
    })
    .eq("session_id_onchain", payload.sessionIdOnchain);

  if (sessionUpdate.error) {
    throw new Error(sessionUpdate.error.message);
  }

  return normalizeReceipt(receiptData as Record<string, unknown>);
}

export async function getActiveCampaignsForUser(
  userWallet: string,
): Promise<ActiveCampaignResult> {
  const user = await getUser(userWallet);
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("active", true)
    .gt("remaining_budget", 0)
    // Only serve campaigns whose Solana Campaign PDA actually exists.
    // Cross-chain rows pass through 'initiated' → 'evm_confirmed' →
    // 'cctp_attested' → 'solana_minted' before the oracle has confirmed
    // USDC arrival on Solana via confirm_usdc_received. Serving those
    // earlier statuses to the SDK causes start_stream/tick_stream to
    // hit AccountNotInitialized (0xbc4) on the campaign account.
    .in("bridge_status", ["native", "solana_minted", "active"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const campaigns = (data ?? [])
    .map((row) => normalizeCampaign(row as Record<string, unknown>))
    .filter((campaign) => campaignMatchesUser(campaign, user));

  return { user, campaigns };
}

export async function getUserDashboard(
  wallet: string,
): Promise<UserDashboardData> {
  const [sessions, ticks, vaultBalance, attentionScore] = await Promise.all([
    selectSessions({ userWallet: wallet }),
    selectTicks({ userWallet: wallet }),
    getVaultBalance(wallet),
    getAttentionScore(wallet),
  ]);
  const campaigns = await Promise.all(
    Array.from(
      new Set(sessions.map((session) => session.campaign_id_onchain)),
    ).map((id) => selectCampaignById(id)),
  );

  const categoryFrequency = new Map<string, number>();

  for (const session of sessions) {
    const campaign = campaigns.find(
      (item) => item?.campaign_id_onchain === session.campaign_id_onchain,
    );
    const topPreference = campaign?.target_preferences?.[0];

    if (topPreference) {
      categoryFrequency.set(
        topPreference,
        (categoryFrequency.get(topPreference) ?? 0) + 1,
      );
    }
  }

  const favoriteAdCategory =
    Array.from(categoryFrequency.entries()).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0] ?? "tech";
  const activeSession = sessions.find((session) => session.active) ?? null;
  const activeTicks = activeSession
    ? ticks.filter(
        (tick) => tick.session_id_onchain === activeSession.session_id_onchain,
      )
    : [];
  const currentAmount = sumNumbers(activeTicks.map((tick) => tick.user_amount));
  const currentSeconds = sumNumbers(
    activeTicks.map((tick) => tick.seconds_elapsed),
  );
  const mostRecentTick = activeTicks[0];

  return {
    stats: {
      totalUsdcEarned: vaultBalance.totalEarned,
      totalSessionsCompleted: sessions.filter((session) => !session.active)
        .length,
      totalSecondsVerified: sumNumbers(
        sessions.map((session) => session.seconds_verified),
      ),
      favoriteAdCategory,
      attentionScore: attentionScore.score,
      attentionUpdatedAt: attentionScore.updatedAt,
    },
    liveSession: {
      sessionId: activeSession?.session_id_onchain ?? null,
      currentAmount,
      sessionSeconds: currentSeconds || activeSession?.seconds_verified || 0,
      ratePerSecond:
        mostRecentTick && mostRecentTick.seconds_elapsed > 0
          ? mostRecentTick.user_amount / mostRecentTick.seconds_elapsed
          : 0,
      verified: Boolean(activeSession),
    },
    vault: {
      totalEarned: vaultBalance.totalEarned,
      totalWithdrawn: vaultBalance.totalWithdrawn,
      availableBalance: vaultBalance.availableBalance,
    },
  };
}

export async function getUserHistory(wallet: string): Promise<UserHistoryData> {
  const sessions = await selectSessions({ userWallet: wallet });
  const receipts = await selectReceipts(wallet);
  const campaigns = await Promise.all(
    Array.from(
      new Set(sessions.map((session) => session.campaign_id_onchain)),
    ).map((id) => selectCampaignById(id)),
  );

  return {
    sessions: sessions.map((session) => {
      const matchingReceipt = receipts.find(
        (receipt) => receipt.session_id_onchain === session.session_id_onchain,
      );
      const matchingCampaign = campaigns.find(
        (campaign) =>
          campaign?.campaign_id_onchain === session.campaign_id_onchain,
      );

      return {
        date: session.started_at,
        duration: session.seconds_verified,
        earned: matchingReceipt?.usdc_paid ?? session.total_paid_usdc / 2,
        campaignTitle: matchingCampaign?.title ?? "Unknown campaign",
        receiptUrl: matchingReceipt
          ? buildExplorerUrl("token", matchingReceipt.token_id)
          : null,
      };
    }),
    receipts: receipts.map((receipt) => ({
      tokenId: receipt.token_id,
      sessionIdOnchain: receipt.session_id_onchain,
      usdcEarned: receipt.usdc_paid,
      secondsVerified: receipt.seconds_verified,
      mintedAt: receipt.minted_at,
      explorerUrl: buildExplorerUrl("token", receipt.token_id),
    })),
  };
}

export function getRoleDestination(role: RoleName) {
  return roleMeta[role];
}

// ─── Vault normalizers ────────────────────────────────────────────────────────

function normalizeVaultCredit(row: Record<string, unknown>): VaultCreditRecord {
  return {
    id: String(row.id),
    wallet_address: normalizeWallet(String(row.wallet_address)),
    session_id_onchain: String(row.session_id_onchain),
    campaign_id_onchain: String(row.campaign_id_onchain),
    amount: safeNumber(row.amount as string | number),
    role: Number(row.role ?? 0),
    credited_at: String(row.credited_at),
  };
}

function normalizeVaultWithdrawal(
  row: Record<string, unknown>,
): VaultWithdrawalRecord {
  return {
    id: String(row.id),
    wallet_address: normalizeWallet(String(row.wallet_address)),
    amount: safeNumber(row.amount as string | number),
    withdrawn_at: String(row.withdrawn_at),
  };
}

// ─── Publisher / Advertiser getters ──────────────────────────────────────────

export async function getPublisherByWallet(
  wallet: string,
): Promise<PublisherRecord | null> {
  return selectRoleRecord<PublisherRecord>("publisher", wallet);
}

export async function getAdvertiserByWallet(
  wallet: string,
): Promise<AdvertiserRecord | null> {
  return selectRoleRecord<AdvertiserRecord>("advertiser", wallet);
}

export async function verifyPublisherApiKey(
  apiKey: string,
): Promise<{ publisherWallet: string; platformName: string } | null> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("publishers")
    .select("wallet_address, platform_name")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    publisherWallet: normalizeWallet(String(data.wallet_address)),
    platformName: String(data.platform_name),
  };
}

// ─── User earnings ────────────────────────────────────────────────────────────

export async function getUserEarnings(
  wallet: string,
): Promise<UserEarningsData> {
  const ticks = await selectTicks({ userWallet: wallet });
  const recentTicks = ticks.slice(0, 20);
  const sessionIds = new Set(ticks.map((t) => t.session_id_onchain));

  return {
    totalEarned: sumNumbers(ticks.map((t) => t.user_amount)),
    totalSessions: sessionIds.size,
    totalSeconds: sumNumbers(ticks.map((t) => t.seconds_elapsed)),
    recentTicks,
  };
}

// ─── Receipts queries ─────────────────────────────────────────────────────────

export async function getReceiptsByUser(
  wallet: string,
): Promise<ReceiptRecord[]> {
  return selectReceipts(wallet);
}

export async function getAttentionScore(
  wallet: string,
  filters?: { chains?: string[]; platforms?: string[] },
): Promise<AttentionScoreResult> {
  const normalizedWallet = normalizeWallet(wallet);
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not configured");

  let query = supabase
    .from("receipts")
    .select("*")
    .eq("user_wallet", normalizedWallet);

  if (filters?.chains?.length) {
    query = query.in("chain", filters.chains);
  }

  if (filters?.platforms?.length) {
    query = query.in(
      "platform",
      filters.platforms.map((platform) => platform.trim().toLowerCase()),
    );
  }

  const { data: receiptRows, error: receiptError } = await query;
  if (receiptError) throw new Error(receiptError.message);

  const receipts = (receiptRows ?? []).map((row) =>
    normalizeReceipt(row as Record<string, unknown>),
  );

  const sessionsCount = receipts.length;
  const totalSecondsVerified = sumNumbers(
    receipts.map((receipt) => receipt.seconds_verified),
  );
  const consistencyRate = sessionsCount
    ? receipts.filter(
        (receipt) => receipt.seconds_verified >= ATTENTION_CONSISTENCY_MIN_SECONDS,
      ).length / sessionsCount
    : 0;

  let categoryDiversity = 0;
  if (receipts.length) {
    const campaignIds = Array.from(
      new Set(receipts.map((receipt) => receipt.campaign_id_onchain)),
    );
    const { data: campaignRows, error: campaignError } = await supabase
      .from("campaigns")
      .select("campaign_id_onchain, target_preferences")
      .in("campaign_id_onchain", campaignIds);
    if (campaignError) throw new Error(campaignError.message);

    const categorySet = new Set<string>();
    for (const row of campaignRows ?? []) {
      const prefs = (row.target_preferences as PreferenceOption[] | null) ?? [];
      const primary = prefs[0];
      if (primary) categorySet.add(primary);
    }
    categoryDiversity = categorySet.size;
  }

  const totalSecondsScore = clamp01(
    totalSecondsVerified / ATTENTION_SECONDS_TARGET,
  );
  const categoryDiversityScore = clamp01(
    categoryDiversity / ATTENTION_CATEGORY_TARGET,
  );
  const antiBotScore = 1;

  const score = clamp01(
    totalSecondsScore * ATTENTION_SCORE_WEIGHTS.totalSeconds +
      consistencyRate * ATTENTION_SCORE_WEIGHTS.consistency +
      categoryDiversityScore * ATTENTION_SCORE_WEIGHTS.categoryDiversity +
      antiBotScore * ATTENTION_SCORE_WEIGHTS.antiBot,
  );
  const updatedAt = nowIso();

  const breakdown: AttentionScoreBreakdown = {
    totalSecondsVerified,
    sessionsCount,
    categoryDiversity,
    consistencyRate,
    antiBotScore,
    totalSecondsScore,
    categoryDiversityScore,
    score: Number(score.toFixed(4)),
    updatedAt,
  };

  const { error: profileError } = await supabase
    .from("attention_profiles")
    .upsert(
      {
        wallet_address: normalizedWallet,
        score: breakdown.score,
        total_seconds_verified: totalSecondsVerified,
        sessions_count: sessionsCount,
        category_diversity: categoryDiversity,
        consistency_rate: consistencyRate,
        anti_bot_score: antiBotScore,
        updated_at: updatedAt,
      },
      { onConflict: "wallet_address" },
    );
  if (profileError) throw new Error(profileError.message);

  return {
    wallet: normalizedWallet,
    score: breakdown.score,
    updatedAt,
    breakdown,
  };
}

export async function getReceiptsByCampaign(
  campaignId: string,
): Promise<{ receipts: ReceiptRecord[]; advertiserWallet: string | null }> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const [receiptsResult, campaignResult] = await Promise.all([
    supabase
      .from("receipts")
      .select("*")
      .eq("campaign_id_onchain", campaignId)
      .order("minted_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("advertiser_wallet")
      .eq("campaign_id_onchain", campaignId)
      .maybeSingle(),
  ]);

  if (receiptsResult.error) throw new Error(receiptsResult.error.message);
  if (campaignResult.error) throw new Error(campaignResult.error.message);

  return {
    receipts: (receiptsResult.data ?? []).map((row) =>
      normalizeReceipt(row as Record<string, unknown>),
    ),
    advertiserWallet: campaignResult.data
      ? normalizeWallet(String(campaignResult.data.advertiser_wallet))
      : null,
  };
}

// ─── Vault ────────────────────────────────────────────────────────────────────

export async function getVaultBalance(
  wallet: string,
): Promise<VaultBalanceData> {
  const normalizedWallet = normalizeWallet(wallet);
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const [creditsResult, withdrawalsResult] = await Promise.all([
    supabase
      .from("vault_credits")
      .select("*")
      .eq("wallet_address", normalizedWallet)
      .order("credited_at", { ascending: false }),
    supabase
      .from("vault_withdrawals")
      .select("*")
      .eq("wallet_address", normalizedWallet)
      .order("withdrawn_at", { ascending: false }),
  ]);

  if (creditsResult.error) throw new Error(creditsResult.error.message);
  if (withdrawalsResult.error) throw new Error(withdrawalsResult.error.message);

  const credits = (creditsResult.data ?? []).map((row) =>
    normalizeVaultCredit(row as Record<string, unknown>),
  );
  const withdrawals = (withdrawalsResult.data ?? []).map((row) =>
    normalizeVaultWithdrawal(row as Record<string, unknown>),
  );
  const totalEarned = sumNumbers(credits.map((c) => c.amount));
  const totalWithdrawn = sumNumbers(withdrawals.map((w) => w.amount));

  return {
    totalEarned,
    totalWithdrawn,
    availableBalance: totalEarned - totalWithdrawn,
    credits,
    withdrawals,
  };
}

export async function creditVault(input: {
  walletAddress: string;
  sessionIdOnchain: string;
  campaignIdOnchain: string;
  amount: number;
  role: number;
  creditedAt: string;
}): Promise<VaultCreditRecord> {
  const payload: VaultCreditRecord = {
    id: crypto.randomUUID(),
    wallet_address: normalizeWallet(input.walletAddress),
    session_id_onchain: input.sessionIdOnchain,
    campaign_id_onchain: input.campaignIdOnchain,
    amount: input.amount,
    role: input.role,
    credited_at: input.creditedAt,
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("vault_credits")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalizeVaultCredit(data as Record<string, unknown>);
}

export async function recordWithdrawal(input: {
  walletAddress: string;
  amount: number;
  withdrawnAt: string;
}): Promise<VaultWithdrawalRecord> {
  const payload: VaultWithdrawalRecord = {
    id: crypto.randomUUID(),
    wallet_address: normalizeWallet(input.walletAddress),
    amount: input.amount,
    withdrawn_at: input.withdrawnAt,
  };
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase
    .from("vault_withdrawals")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalizeVaultWithdrawal(data as Record<string, unknown>);
}

// ─── Session / Campaign lifecycle ─────────────────────────────────────────────

export async function endSession(input: {
  sessionIdOnchain: string;
  secondsVerified: number;
  totalPaid: number;
  endedAt: string;
}): Promise<{ success: boolean }> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  // Reconstruct missing ticks if oracle sent incomplete data
  const { data: ticks, error: ticksError } = await supabase
    .from("stream_ticks")
    .select("seconds_elapsed, session_id_onchain")
    .eq("session_id_onchain", input.sessionIdOnchain);

  if (ticksError) throw new Error(ticksError.message);

  const totalRecordedSeconds = sumNumbers(
    (ticks ?? []).map((t) => t.seconds_elapsed as number),
  );

  if (totalRecordedSeconds < input.secondsVerified) {
    const missingSeconds = input.secondsVerified - totalRecordedSeconds;
    const missingTotalAmount =
      (missingSeconds / input.secondsVerified) * input.totalPaid;
    // Protocol split: 30% user / 50% publisher / 10% validators / 10% VISTA.
    const missingUserAmount = (missingTotalAmount * 30) / 100;
    const missingPublisherAmount = (missingTotalAmount * 50) / 100;
    const missingValidatorAmount = (missingTotalAmount * 10) / 100;
    const missingVistaAmount =
      missingTotalAmount -
      missingUserAmount -
      missingPublisherAmount -
      missingValidatorAmount;

    // Get session to extract user/publisher wallets
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("user_wallet, publisher_wallet, campaign_id_onchain")
      .eq("session_id_onchain", input.sessionIdOnchain)
      .single();

    if (sessionError) throw new Error(sessionError.message);

    const syntheticTick = {
      id: crypto.randomUUID(),
      session_id_onchain: input.sessionIdOnchain,
      user_wallet: (session as Record<string, unknown>).user_wallet as string,
      publisher_wallet: (session as Record<string, unknown>)
        .publisher_wallet as string,
      user_amount: missingUserAmount,
      publisher_amount: missingPublisherAmount,
      validator_amount: missingValidatorAmount,
      vista_amount: missingVistaAmount,
      total_amount: missingTotalAmount,
      seconds_elapsed: missingSeconds,
      block_timestamp: input.endedAt,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("stream_ticks")
      .insert(syntheticTick);

    if (insertError) throw new Error(insertError.message);
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      active: false,
      seconds_verified: input.secondsVerified,
      total_paid_usdc: input.totalPaid,
      ended_at: input.endedAt,
    })
    .eq("session_id_onchain", input.sessionIdOnchain);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function confirmCampaign(
  campaignIdOnchain: string,
): Promise<{ success: boolean }> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ active: true })
    .eq("campaign_id_onchain", campaignIdOnchain);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function endCampaign(
  campaignIdOnchain: string,
): Promise<{ success: boolean }> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ active: false })
    .eq("campaign_id_onchain", campaignIdOnchain);

  if (error) throw new Error(error.message);
  return { success: true };
}
