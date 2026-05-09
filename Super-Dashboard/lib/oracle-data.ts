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
    }
  | {
      event: "cross_chain_evm_confirmed";
      payload: {
        campaign_id_onchain: string;
        source_chain: "base-sepolia" | "arbitrum-sepolia";
        source_chain_tx_hash: string;
        cctp_nonce: string;
        advertiser_evm_address: string;
        total_budget_raw: string;
        observed_at: string;
      };
    }
  | {
      event: "cross_chain_attested";
      payload: {
        campaign_id_onchain: string;
        cctp_nonce: string;
        observed_at: string;
      };
    }
  | {
      event: "cross_chain_active";
      payload: {
        campaign_id_onchain: string;
        confirm_tx?: string;
        activated_at: string;
      };
    }
  | {
      event: "cross_chain_failed";
      payload: {
        campaign_id_onchain: string;
        stage: string;
        error: string;
      };
    }
  | {
      event: "campaign_created";
      payload: {
        campaign_id_onchain: string;
        advertiser_wallet: string;
        total_budget: string;
        rate_per_second: string;
        block_slot: number;
      };
    }
  | {
      event: "stream_started";
      payload: {
        session_id_onchain: string;
        campaign_id_onchain: string;
        user_wallet: string;
        publisher_wallet: string;
        started_at: string;
      };
    }
  | {
      event: "stream_tick";
      payload: {
        session_id_onchain: string;
        user_wallet: string;
        publisher_wallet: string;
        total_amount: string;
        user_amount: string;
        publisher_amount: string;
        validator_amount: string;
        vista_amount: string;
        block_timestamp: string;
      };
    }
  | {
      event: "stream_ended";
      payload: {
        session_id_onchain: string;
        seconds_verified: number;
        total_paid: string;
        ended_at: string;
      };
    }
  | {
      event: "receipt_minted";
      payload: {
        token_id: string;
        session_id_onchain: string;
        campaign_id_onchain: string;
        user_wallet: string;
        seconds_verified: number;
        usdc_paid: string;
        minted_at: string;
      };
    }
  | {
      event: "withdrawn";
      payload: {
        wallet: string;
        amount: string;
        withdrawn_at: string;
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
    case "cross_chain_evm_confirmed": {
      await supabase
        .from("campaigns")
        .update({
          bridge_status: "evm_confirmed",
          source_chain: evt.payload.source_chain,
          source_chain_tx_hash: evt.payload.source_chain_tx_hash,
          cctp_nonce: Number(evt.payload.cctp_nonce),
          advertiser_evm_address: evt.payload.advertiser_evm_address,
        })
        .eq("campaign_id_onchain", evt.payload.campaign_id_onchain.toLowerCase());
      return;
    }
    case "cross_chain_attested": {
      await supabase
        .from("campaigns")
        .update({ bridge_status: "cctp_attested" })
        .eq("campaign_id_onchain", evt.payload.campaign_id_onchain.toLowerCase());
      return;
    }
    case "cross_chain_active": {
      await supabase
        .from("campaigns")
        .update({
          bridge_status: "active",
          bridged_at: evt.payload.activated_at,
          active: true,
        })
        .eq("campaign_id_onchain", evt.payload.campaign_id_onchain.toLowerCase());
      return;
    }
    case "cross_chain_failed": {
      await supabase
        .from("campaigns")
        .update({ bridge_status: "failed" })
        .eq("campaign_id_onchain", evt.payload.campaign_id_onchain.toLowerCase());
      return;
    }
    case "campaign_created": {
      // Backfill in case the dashboard never saw the off-chain create. The
      // creative_url/title/target_url are unknown from the chain event, so
      // leave them as placeholders if the row is brand new — the frontend
      // upsert flow will fill them in on the next user-initiated write.
      await supabase.from("campaigns").upsert(
        {
          campaign_id_onchain: evt.payload.campaign_id_onchain.toLowerCase(),
          advertiser_wallet: evt.payload.advertiser_wallet,
          total_budget: Number(evt.payload.total_budget),
          remaining_budget: Number(evt.payload.total_budget),
          rate_per_second: Number(evt.payload.rate_per_second),
          title: "(synced from chain)",
          creative_url: "",
          target_url: "",
          active: true,
        },
        { onConflict: "campaign_id_onchain", ignoreDuplicates: true },
      );
      return;
    }
    case "stream_started": {
      await supabase.from("sessions").upsert(
        {
          session_id_onchain: evt.payload.session_id_onchain,
          campaign_id_onchain: evt.payload.campaign_id_onchain.toLowerCase(),
          user_wallet: evt.payload.user_wallet,
          publisher_wallet: evt.payload.publisher_wallet,
          active: true,
          started_at: evt.payload.started_at,
        },
        { onConflict: "session_id_onchain" },
      );
      return;
    }
    case "stream_tick": {
      // Insert per-tick row + roll up totals on sessions + write per-role
      // vault_credits ledger entries so getVaultBalance(wallet) sees a non-
      // zero earned balance.
      //
      // The on-chain StreamTick event carries raw u64 USDC base units
      // (6 decimals — e.g. 432 = 0.000432 USDC). Every reader downstream
      // (UsdcCounter, getUserDashboard.currentAmount, getPublisherAnalytics,
      // getVaultBalance, etc.) treats the column as a USDC decimal number,
      // not raw atoms — recordStreamTick (data.ts:1957) already follows
      // that convention. Convert here to keep the schema consistent.
      const RAW_TO_USDC = 1_000_000; // 10 ** USDC_DECIMALS
      const total = Number(evt.payload.total_amount) / RAW_TO_USDC;
      const userAmt = Number(evt.payload.user_amount) / RAW_TO_USDC;
      const publisherAmt = Number(evt.payload.publisher_amount) / RAW_TO_USDC;
      const validatorAmt = Number(evt.payload.validator_amount) / RAW_TO_USDC;
      const vistaAmt = Number(evt.payload.vista_amount) / RAW_TO_USDC;

      await supabase.from("stream_ticks").insert({
        session_id_onchain: evt.payload.session_id_onchain,
        user_wallet: evt.payload.user_wallet,
        publisher_wallet: evt.payload.publisher_wallet,
        user_amount: userAmt,
        publisher_amount: publisherAmt,
        validator_amount: validatorAmt,
        vista_amount: vistaAmt,
        total_amount: total,
        seconds_elapsed: 0,
        block_timestamp: evt.payload.block_timestamp,
      });

      // Look up the session to get campaign_id (needed by vault_credits) and
      // the running total_paid for the rollup. total_paid_usdc is stored in
      // USDC decimal — `total` is already converted above, so the addition
      // stays in the same unit.
      const { data: sess } = await supabase
        .from("sessions")
        .select("total_paid_usdc, campaign_id_onchain")
        .eq("session_id_onchain", evt.payload.session_id_onchain)
        .maybeSingle();
      const sessRow = (sess ?? {}) as {
        total_paid_usdc?: number;
        campaign_id_onchain?: string;
      };
      const prevTotal = Number(sessRow.total_paid_usdc ?? 0);
      const campaignId = sessRow.campaign_id_onchain ?? "";

      await supabase
        .from("sessions")
        .update({ total_paid_usdc: prevTotal + total })
        .eq("session_id_onchain", evt.payload.session_id_onchain);

      // Per-role vault_credits rows so the user/publisher dashboards see
      // their accrued balance.
      await supabase.from("vault_credits").insert([
        {
          wallet_address: evt.payload.user_wallet,
          session_id_onchain: evt.payload.session_id_onchain,
          campaign_id_onchain: campaignId,
          amount: userAmt,
          role: 0,
          credited_at: evt.payload.block_timestamp,
        },
        {
          wallet_address: evt.payload.publisher_wallet,
          session_id_onchain: evt.payload.session_id_onchain,
          campaign_id_onchain: campaignId,
          amount: publisherAmt,
          role: 1,
          credited_at: evt.payload.block_timestamp,
        },
      ]);
      return;
    }
    case "stream_ended": {
      // sessions.total_paid_usdc + receipts.usdc_paid + vault_*.amount are
      // stored as USDC decimal across the codebase (see recordStreamTick at
      // data.ts:1979). Convert from the on-chain raw u64 (6-decimal) here.
      const totalPaidUsdc = Number(evt.payload.total_paid) / 1_000_000;
      await supabase
        .from("sessions")
        .update({
          active: false,
          ended_at: evt.payload.ended_at,
          seconds_verified: evt.payload.seconds_verified,
          total_paid_usdc: totalPaidUsdc,
        })
        .eq("session_id_onchain", evt.payload.session_id_onchain);
      return;
    }
    case "receipt_minted": {
      // The receipts table requires advertiser_wallet, which is not in the
      // event payload — look it up from the campaign.
      const { data: camp } = await supabase
        .from("campaigns")
        .select("advertiser_wallet, chain")
        .eq("campaign_id_onchain", evt.payload.campaign_id_onchain.toLowerCase())
        .maybeSingle();
      const advertiserWallet =
        (camp as { advertiser_wallet?: string } | null)?.advertiser_wallet ?? "";
      const chain = (camp as { chain?: string } | null)?.chain ?? "solana-devnet";

      await supabase.from("receipts").insert({
        token_id: evt.payload.token_id,
        session_id_onchain: evt.payload.session_id_onchain,
        user_wallet: evt.payload.user_wallet,
        advertiser_wallet: advertiserWallet,
        campaign_id_onchain: evt.payload.campaign_id_onchain.toLowerCase(),
        chain,
        platform: "vista",
        seconds_verified: evt.payload.seconds_verified,
        usdc_paid: Number(evt.payload.usdc_paid) / 1_000_000,
        minted_at: evt.payload.minted_at,
      });
      return;
    }
    case "withdrawn": {
      // vault_withdrawals.amount is read by getVaultBalance.totalWithdrawn
      // and rendered as USDC. Convert raw u64 → decimal.
      await supabase.from("vault_withdrawals").insert({
        wallet_address: evt.payload.wallet,
        amount: Number(evt.payload.amount) / 1_000_000,
        withdrawn_at: evt.payload.withdrawn_at,
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
