import type { ChartPoint, SessionListItem } from "@/lib/types"

/**
 * Raw earning record returned by VistaVault.getEarningRecords().
 * Tuple fields are mapped to named props by viem automatically.
 */
export interface OnChainEarningRecord {
  sessionId: `0x${string}`
  publisherWallet: `0x${string}`
  campaignId: `0x${string}`
  amount: bigint
  role: number
  timestamp: bigint
}

/**
 * Session data returned by VistaStream.sessions(bytes32).
 * Solidity auto-generated getter returns a flat tuple which viem
 * decodes as a positional array.
 */
export type OnChainSessionTuple = readonly [
  sessionId: `0x${string}`,    // 0
  campaignId: `0x${string}`,   // 1
  userWallet: `0x${string}`,   // 2
  publisherWallet: `0x${string}`, // 3
  secondsVerified: bigint,     // 4
  totalPaid: bigint,           // 5
  active: boolean,             // 6
  startedAt: bigint,           // 7
]

const PUBLISHER_ROLE = 1
const USDC_DECIMALS = 1_000_000

/** Filter records to publisher-only (role === 1) */
function publisherRecords(
  records: readonly OnChainEarningRecord[],
): OnChainEarningRecord[] {
  return records.filter((r) => r.role === PUBLISHER_ROLE)
}

/**
 * Derive Total USDC Earned and Total Ad Impressions from on-chain
 * earning records (publisher role only).
 */
export function computePublisherStats(
  records: readonly OnChainEarningRecord[] | undefined,
): { totalUsdcEarned: number; totalAdImpressions: number } {
  if (!records || records.length === 0) {
    return { totalUsdcEarned: 0, totalAdImpressions: 0 }
  }

  const pubRecords = publisherRecords(records)

  const totalUsdcEarned = pubRecords.reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  ) / USDC_DECIMALS

  const uniqueSessions = new Set(pubRecords.map((r) => r.sessionId))

  return {
    totalUsdcEarned,
    totalAdImpressions: uniqueSessions.size,
  }
}

/**
 * Build a ChartPoint[] time-series (one point per day) from on-chain
 * earning records (publisher role only).
 */
export function computeRevenuePerDay(
  records: readonly OnChainEarningRecord[] | undefined,
): ChartPoint[] {
  if (!records || records.length === 0) return []

  const pubRecords = publisherRecords(records)

  // Group by YYYY-MM-DD
  const dayMap = new Map<string, number>()

  for (const r of pubRecords) {
    const date = new Date(Number(r.timestamp) * 1000)
    const key = date.toISOString().slice(0, 10) // "YYYY-MM-DD"
    dayMap.set(key, (dayMap.get(key) ?? 0) + Number(r.amount) / USDC_DECIMALS)
  }

  // Sort by date ascending and build ChartPoint[]
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value,
    }))
}

// ─── Session multicall helpers ───────────────────────────────────

/**
 * Extract unique publisher sessionIds from earning records so we can
 * build a multicall to VistaStream.sessions(id).
 */
export function extractUniqueSessionIds(
  records: readonly OnChainEarningRecord[] | undefined,
): `0x${string}`[] {
  if (!records || records.length === 0) return []
  const pubRecords = publisherRecords(records)
  return Array.from(new Set(pubRecords.map((r) => r.sessionId)))
}

/**
 * Sum publisher earnings per session from earning records.
 * Returns a Map<sessionId, totalPublisherAmount (USDC float)>.
 */
function publisherAmountBySession(
  records: readonly OnChainEarningRecord[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of publisherRecords(records)) {
    map.set(
      r.sessionId,
      (map.get(r.sessionId) ?? 0) + Number(r.amount) / USDC_DECIMALS,
    )
  }
  return map
}

/**
 * Compute totalViewerSeconds and activeSessions from multicall results.
 */
export function computeSessionStats(
  sessionResults: readonly ({ status: "success"; result: OnChainSessionTuple } | { status: "failure"; error: Error })[] | undefined,
): { totalViewerSeconds: number; activeSessions: number } {
  if (!sessionResults) return { totalViewerSeconds: 0, activeSessions: 0 }

  let totalViewerSeconds = 0
  let activeSessions = 0

  for (const entry of sessionResults) {
    if (entry.status !== "success") continue
    const tuple = entry.result
    totalViewerSeconds += Number(tuple[4]) // secondsVerified
    if (tuple[6]) activeSessions += 1      // active
  }

  return { totalViewerSeconds, activeSessions }
}

/**
 * Build a SessionListItem[] for the recent sessions table from
 * multicall results + earning records (for publisher amount).
 * Returns the 6 most recent sessions sorted by startedAt desc.
 */
export function buildRecentSessions(
  sessionResults: readonly ({ status: "success"; result: OnChainSessionTuple } | { status: "failure"; error: Error })[] | undefined,
  earningRecords: readonly OnChainEarningRecord[] | undefined,
): SessionListItem[] {
  if (!sessionResults || !earningRecords) return []

  const pubAmounts = publisherAmountBySession(earningRecords)

  const items: SessionListItem[] = []

  for (const entry of sessionResults) {
    if (entry.status !== "success") continue
    const t = entry.result
    const sessionId = t[0] as string

    items.push({
      id: sessionId,
      sessionIdOnchain: sessionId,
      campaignIdOnchain: t[1] as string,
      userWallet: t[2] as string,
      publisherWallet: t[3] as string,
      secondsVerified: Number(t[4]),
      usdcPaid: Number(t[5]) / USDC_DECIMALS,
      publisherAmount: pubAmounts.get(sessionId) ?? 0,
      startedAt: new Date(Number(t[7]) * 1000).toISOString(),
      endedAt: null,
      status: t[6] ? "active" : "ended",
    })
  }

  // Sort by startedAt descending, take 6
  return items
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 6)
}
