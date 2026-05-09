import { createServerSupabaseClient } from "@/lib/supabase";
import { getAttentionScore } from "@/lib/data";
import type { SupportedEvmChainKey } from "@/lib/evm/chains";

export const PRIMARY_WEIGHT = 1.0;
export const DEFAULT_SECONDARY_WEIGHT = 0.7;

export type IdentityChainKey = "solana-devnet" | SupportedEvmChainKey;

export interface LinkedWallet {
  id: string;
  primary_wallet: string;
  secondary_wallet: string;
  secondary_chain: SupportedEvmChainKey;
  reputation_weight: number;
  linked_at: string;
}

export interface IdentityAttentionSource {
  wallet: string;
  chain: IdentityChainKey;
  role: "primary" | "secondary";
  weight: number;
  rawScore: number;
  weightedScore: number;
  totalSecondsVerified: number;
  sessionsCount: number;
}

export interface AggregatedAttention {
  primaryWallet: string;
  aggregatedScore: number;
  totalWeightedSeconds: number;
  sources: IdentityAttentionSource[];
}

export async function getLinkedWallets(
  primary: string,
): Promise<LinkedWallet[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("linked_wallets")
    .select(
      "id, primary_wallet, secondary_wallet, secondary_chain, reputation_weight, linked_at",
    )
    .eq("primary_wallet", primary)
    .order("linked_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LinkedWallet[];
}

export async function getAggregatedAttention(
  primary: string,
): Promise<AggregatedAttention> {
  const links = await getLinkedWallets(primary);

  const [primaryResult, ...secondaryResults] = await Promise.all([
    getAttentionScore(primary).catch(() => null),
    ...links.map((link) =>
      getAttentionScore(link.secondary_wallet, {
        chains: [link.secondary_chain],
      }).catch(() => null),
    ),
  ]);

  const sources: IdentityAttentionSource[] = [];

  if (primaryResult) {
    const breakdown = primaryResult.breakdown;
    sources.push({
      wallet: primary,
      chain: "solana-devnet",
      role: "primary",
      weight: PRIMARY_WEIGHT,
      rawScore: primaryResult.score,
      weightedScore: primaryResult.score * PRIMARY_WEIGHT,
      totalSecondsVerified: breakdown?.totalSecondsVerified ?? 0,
      sessionsCount: breakdown?.sessionsCount ?? 0,
    });
  }

  links.forEach((link, i) => {
    const result = secondaryResults[i];
    if (!result) return;
    const breakdown = result.breakdown;
    sources.push({
      wallet: link.secondary_wallet,
      chain: link.secondary_chain,
      role: "secondary",
      weight: link.reputation_weight,
      rawScore: result.score,
      weightedScore: result.score * link.reputation_weight,
      totalSecondsVerified: breakdown?.totalSecondsVerified ?? 0,
      sessionsCount: breakdown?.sessionsCount ?? 0,
    });
  });

  const aggregatedScore = Math.min(
    1,
    sources.reduce((sum, s) => sum + s.weightedScore, 0),
  );
  const totalWeightedSeconds = sources.reduce(
    (sum, s) => sum + s.totalSecondsVerified * s.weight,
    0,
  );

  return {
    primaryWallet: primary,
    aggregatedScore: Number(aggregatedScore.toFixed(4)),
    totalWeightedSeconds: Number(totalWeightedSeconds.toFixed(2)),
    sources,
  };
}
