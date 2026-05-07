import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  OracleNetworkStats,
  OracleNodeRecord,
  OracleSubmissionRecord,
} from "@/lib/types";

function client() {
  const c = createServerSupabaseClient();
  if (!c) throw new Error("Supabase client is not configured");
  return c;
}

export async function getOracleNode(
  oraclePubkey: string,
): Promise<OracleNodeRecord | null> {
  const { data, error } = await client()
    .from("oracle_nodes")
    .select("*")
    .eq("oracle_pubkey", oraclePubkey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OracleNodeRecord | null) ?? null;
}

export async function getActiveOracleNodes(): Promise<OracleNodeRecord[]> {
  const { data, error } = await client()
    .from("oracle_nodes")
    .select("*")
    .eq("active", true)
    .order("stake_amount", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as OracleNodeRecord[]) ?? [];
}

export async function getOracleSubmissions(
  oraclePubkey: string,
  limit = 20,
): Promise<OracleSubmissionRecord[]> {
  const { data, error } = await client()
    .from("oracle_submissions")
    .select("*")
    .eq("oracle_pubkey", oraclePubkey)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as OracleSubmissionRecord[]) ?? [];
}

export async function getOracleSubmissionsForSession(
  sessionId: string,
): Promise<OracleSubmissionRecord[]> {
  const { data, error } = await client()
    .from("oracle_submissions")
    .select("*")
    .eq("session_id_onchain", sessionId);
  if (error) throw new Error(error.message);
  return (data as OracleSubmissionRecord[]) ?? [];
}

export async function getOracleNetworkStats(): Promise<OracleNetworkStats> {
  const supabase = client();

  const [activeNodesQ, submissionsTodayQ, recentSlashesQ] = await Promise.all([
    supabase
      .from("oracle_nodes")
      .select("stake_amount, total_submissions, total_slashes")
      .eq("active", true),
    supabase
      .from("oracle_submissions")
      .select("session_id_onchain, was_outlier, submitted_at")
      .gte(
        "submitted_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ),
    supabase
      .from("oracle_submissions")
      .select("id", { count: "exact", head: true })
      .eq("was_outlier", true)
      .gte(
        "submitted_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

  if (activeNodesQ.error) throw new Error(activeNodesQ.error.message);
  if (submissionsTodayQ.error) throw new Error(submissionsTodayQ.error.message);
  if (recentSlashesQ.error) throw new Error(recentSlashesQ.error.message);

  const nodes = (activeNodesQ.data ?? []) as Array<{
    stake_amount: number;
    total_submissions: number;
    total_slashes: number;
  }>;
  const subsToday = (submissionsTodayQ.data ?? []) as Array<{
    session_id_onchain: string;
    was_outlier: boolean;
  }>;

  const totalStaked = nodes.reduce((s, n) => s + Number(n.stake_amount), 0);
  const totalSubmissions = nodes.reduce(
    (s, n) => s + Number(n.total_submissions),
    0,
  );
  const totalSlashes = nodes.reduce(
    (s, n) => s + Number(n.total_slashes),
    0,
  );

  const sessionsToday = new Set(subsToday.map((s) => s.session_id_onchain)).size;

  const accuracy =
    totalSubmissions > 0
      ? ((totalSubmissions - totalSlashes) / totalSubmissions) * 100
      : 100;

  return {
    activeNodes: nodes.length,
    totalStaked,
    sessionsToday,
    networkAccuracyPercent: Math.max(0, Math.min(100, accuracy)),
    recentSlashes: recentSlashesQ.count ?? 0,
  };
}

type SyncEvent =
  | {
      event: "registered";
      payload: {
        oracle: string;
        endpoint_url: string;
        stake_amount: number;
        registered_at: string;
      };
    }
  | {
      event: "unregistered";
      payload: { oracle: string; unregistered_at: string };
    }
  | {
      event: "slashed";
      payload: { oracle: string; amount: number; timestamp: string };
    }
  | {
      event: "reward_credited";
      payload: {
        oracle: string;
        amount: number;
        session_id_onchain: string;
        was_outlier?: boolean;
      };
    }
  | {
      event: "rewards_claimed";
      payload: { oracle: string; amount: number; timestamp: string };
    }
  | {
      event: "submission";
      payload: {
        oracle: string;
        session_id_onchain: string;
        score: number;
        signals?: Record<string, unknown>;
        submitted_at: string;
      };
    }
  | {
      event: "session_aggregated";
      payload: {
        session_id_onchain: string;
        consensus_score: number;
        outliers: string[];
        honest: string[];
        per_oracle_reward: number;
        settled_at: string;
      };
    };

export async function applyOracleSyncEvent(evt: SyncEvent) {
  const supabase = client();

  switch (evt.event) {
    case "registered": {
      await supabase.from("oracle_nodes").upsert(
        {
          oracle_pubkey: evt.payload.oracle,
          endpoint_url: evt.payload.endpoint_url,
          stake_amount: evt.payload.stake_amount,
          active: true,
          registered_at: evt.payload.registered_at,
          unregistered_at: null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "oracle_pubkey" },
      );
      return;
    }
    case "unregistered": {
      await supabase
        .from("oracle_nodes")
        .update({
          active: false,
          unregistered_at: evt.payload.unregistered_at,
        })
        .eq("oracle_pubkey", evt.payload.oracle);
      return;
    }
    case "slashed": {
      const { data } = await supabase
        .from("oracle_nodes")
        .select("stake_amount, total_slashes")
        .eq("oracle_pubkey", evt.payload.oracle)
        .maybeSingle();
      const node = (data ?? {}) as {
        stake_amount?: number;
        total_slashes?: number;
      };
      await supabase
        .from("oracle_nodes")
        .update({
          stake_amount: Math.max(
            0,
            Number(node.stake_amount ?? 0) - evt.payload.amount,
          ),
          total_slashes:
            Number(node.total_slashes ?? 0) + evt.payload.amount,
        })
        .eq("oracle_pubkey", evt.payload.oracle);
      return;
    }
    case "reward_credited": {
      const { data } = await supabase
        .from("oracle_nodes")
        .select("reward_balance, total_submissions, reputation")
        .eq("oracle_pubkey", evt.payload.oracle)
        .maybeSingle();
      const node = (data ?? {}) as {
        reward_balance?: number;
        total_submissions?: number;
        reputation?: number;
      };
      await supabase
        .from("oracle_nodes")
        .update({
          reward_balance:
            Number(node.reward_balance ?? 0) + evt.payload.amount,
          total_submissions: Number(node.total_submissions ?? 0) + 1,
          reputation: Number(node.reputation ?? 0) + 1,
        })
        .eq("oracle_pubkey", evt.payload.oracle);
      return;
    }
    case "rewards_claimed": {
      await supabase
        .from("oracle_nodes")
        .update({ reward_balance: 0 })
        .eq("oracle_pubkey", evt.payload.oracle);
      return;
    }
    case "submission": {
      await supabase.from("oracle_submissions").insert({
        oracle_pubkey: evt.payload.oracle,
        session_id_onchain: evt.payload.session_id_onchain,
        score: evt.payload.score,
        signals: evt.payload.signals ?? null,
        submitted_at: evt.payload.submitted_at,
      });
      return;
    }
    case "session_aggregated": {
      const sessionId = evt.payload.session_id_onchain;
      const honestSet = new Set(evt.payload.honest);
      const outlierSet = new Set(evt.payload.outliers);

      const { data } = await supabase
        .from("oracle_submissions")
        .select("id, oracle_pubkey")
        .eq("session_id_onchain", sessionId);

      const subs = (data ?? []) as Array<{
        id: string;
        oracle_pubkey: string;
      }>;
      for (const s of subs) {
        const isOutlier = outlierSet.has(s.oracle_pubkey);
        const isHonest = honestSet.has(s.oracle_pubkey);
        await supabase
          .from("oracle_submissions")
          .update({
            consensus_score: evt.payload.consensus_score,
            was_outlier: isOutlier,
            is_settled: true,
            earned_amount: isHonest ? evt.payload.per_oracle_reward : 0,
            settled_at: evt.payload.settled_at,
          })
          .eq("id", s.id);
      }
      return;
    }
  }
}

export type { SyncEvent };
