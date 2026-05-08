-- ─────────────────────────────────────────────────────────────────────────
-- VISTA Protocol — full Supabase setup, ready to run from scratch.
--
-- Idempotent: safe to re-run. Paste this entire file into Supabase SQL
-- Editor for a fresh project, or run via supabase CLI:
--     supabase db push
-- All tables, indexes, RLS policies, realtime, vault ledger, AND the
-- cross-chain bridge columns are included.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ─── Identity tables ────────────────────────────────────────────────────

create table if not exists public.users (
  wallet_address text primary key,
  age integer null,
  location text null,
  preferences text[] null,
  created_at timestamptz not null default now()
);

create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  platform_name text not null,
  api_key text unique not null default concat('vista_pub_', gen_random_uuid()::text),
  created_at timestamptz not null default now()
);

create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  company_name text not null,
  created_at timestamptz not null default now()
);

-- ─── Campaign + cross-chain bridge fields ──────────────────────────────

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id_onchain text unique not null,
  advertiser_wallet text not null,
  title text not null,
  creative_url text not null,
  target_url text not null,
  total_budget numeric not null,
  remaining_budget numeric not null,
  rate_per_second numeric not null,
  target_preferences text[] null,
  target_min_age integer null,
  target_max_age integer null,
  target_locations text[] null,
  active boolean not null default true,
  chain text not null default 'solana-devnet',
  created_at timestamptz not null default now(),
  -- Cross-chain advertiser deposit fields
  source_chain text null,
  advertiser_evm_address text null,
  bridge_status text not null default 'native',
  cctp_nonce bigint null,
  source_chain_tx_hash text null,
  lz_message_hash text null,
  bridged_at timestamptz null
);

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'campaigns' and constraint_name = 'campaigns_bridge_status_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_bridge_status_check
      check (bridge_status in (
        'native','initiated','evm_confirmed','cctp_attested','solana_minted','active','failed'
      ));
  end if;
end $$;

-- ─── Sessions, ticks, receipts ─────────────────────────────────────────

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_id_onchain text unique not null,
  campaign_id_onchain text not null,
  user_wallet text not null,
  publisher_wallet text not null,
  seconds_verified integer not null default 0,
  total_paid_usdc numeric not null default 0,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz null
);

create table if not exists public.stream_ticks (
  id uuid primary key default gen_random_uuid(),
  session_id_onchain text not null,
  user_wallet text not null,
  publisher_wallet text not null,
  user_amount numeric not null,
  publisher_amount numeric not null,
  validator_amount numeric not null default 0,
  vista_amount numeric not null default 0,
  total_amount numeric not null,
  seconds_elapsed integer not null,
  block_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  token_id text not null,
  session_id_onchain text not null,
  user_wallet text not null,
  advertiser_wallet text not null,
  campaign_id_onchain text not null,
  chain text not null default 'solana-devnet',
  chain_id integer null,
  platform text null,
  seconds_verified integer not null,
  usdc_paid numeric not null,
  minted_at timestamptz not null
);

-- ─── Off-chain vault ledger (used by /api/vault/*) ─────────────────────

create table if not exists public.vault_credits (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  session_id_onchain text not null,
  campaign_id_onchain text not null,
  amount numeric not null,
  role smallint not null,             -- 0 = user, 1 = publisher
  credited_at timestamptz not null default now()
);

create table if not exists public.vault_withdrawals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  amount numeric not null,
  withdrawn_at timestamptz not null default now()
);

-- ─── Attention scoring ─────────────────────────────────────────────────

create table if not exists public.attention_profiles (
  wallet_address text primary key,
  score numeric not null default 0,
  total_seconds_verified integer not null default 0,
  sessions_count integer not null default 0,
  category_diversity integer not null default 0,
  consistency_rate numeric not null default 0,
  anti_bot_score numeric not null default 1,
  updated_at timestamptz not null default now()
);

-- ─── Oracle network ────────────────────────────────────────────────────

create table if not exists public.oracle_nodes (
  oracle_pubkey text primary key,
  endpoint_url text not null,
  stake_amount numeric not null,
  reward_balance numeric not null default 0,
  reputation integer not null default 0,
  total_submissions bigint not null default 0,
  total_slashes bigint not null default 0,
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  unregistered_at timestamptz null,
  last_seen_at timestamptz null
);

create table if not exists public.oracle_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id_onchain text not null,
  oracle_pubkey text not null references public.oracle_nodes(oracle_pubkey),
  score integer not null,
  consensus_score integer null,
  signals jsonb null,
  submitted_at timestamptz not null,
  was_outlier boolean not null default false,
  is_settled boolean not null default false,
  earned_amount numeric not null default 0,
  slashed_amount numeric not null default 0,
  settled_at timestamptz null
);

-- ─── Indexes ───────────────────────────────────────────────────────────

create index if not exists idx_publishers_wallet on public.publishers (wallet_address);
create index if not exists idx_advertisers_wallet on public.advertisers (wallet_address);
create index if not exists idx_campaigns_advertiser_wallet on public.campaigns (advertiser_wallet);
create index if not exists idx_campaigns_active on public.campaigns (active);
create index if not exists campaigns_bridge_status_idx on public.campaigns(bridge_status) where bridge_status <> 'native';
create index if not exists campaigns_cctp_nonce_idx on public.campaigns(cctp_nonce) where cctp_nonce is not null;
create index if not exists idx_sessions_campaign_id_onchain on public.sessions (campaign_id_onchain);
create index if not exists idx_sessions_user_wallet on public.sessions (user_wallet);
create index if not exists idx_sessions_publisher_wallet on public.sessions (publisher_wallet);
create index if not exists idx_stream_ticks_session_id_onchain on public.stream_ticks (session_id_onchain);
create index if not exists idx_stream_ticks_user_wallet on public.stream_ticks (user_wallet);
create index if not exists idx_stream_ticks_publisher_wallet on public.stream_ticks (publisher_wallet);
create index if not exists idx_receipts_user_wallet on public.receipts (user_wallet);
create index if not exists idx_receipts_campaign_id_onchain on public.receipts (campaign_id_onchain);
create index if not exists idx_receipts_chain on public.receipts (chain);
create index if not exists idx_receipts_platform on public.receipts (platform);
create index if not exists idx_vault_credits_wallet on public.vault_credits (wallet_address);
create index if not exists idx_vault_credits_session on public.vault_credits (session_id_onchain);
create index if not exists idx_vault_withdrawals_wallet on public.vault_withdrawals (wallet_address);
create index if not exists idx_attention_profiles_wallet on public.attention_profiles (wallet_address);
create index if not exists idx_oracle_nodes_active on public.oracle_nodes (active);
create index if not exists idx_oracle_submissions_session on public.oracle_submissions (session_id_onchain);
create index if not exists idx_oracle_submissions_oracle on public.oracle_submissions (oracle_pubkey);

-- ─── Row-level security: open policies (server uses service-role key) ──

alter table public.users enable row level security;
alter table public.publishers enable row level security;
alter table public.advertisers enable row level security;
alter table public.campaigns enable row level security;
alter table public.sessions enable row level security;
alter table public.stream_ticks enable row level security;
alter table public.receipts enable row level security;
alter table public.vault_credits enable row level security;
alter table public.vault_withdrawals enable row level security;
alter table public.attention_profiles enable row level security;
alter table public.oracle_nodes enable row level security;
alter table public.oracle_submissions enable row level security;

-- Helper: re-create a fully-open select/insert/update policy set per table.
do $$
declare
  tbl text;
  tables text[] := array[
    'users', 'publishers', 'advertisers', 'campaigns', 'sessions',
    'stream_ticks', 'receipts', 'vault_credits', 'vault_withdrawals',
    'attention_profiles', 'oracle_nodes', 'oracle_submissions'
  ];
begin
  foreach tbl in array tables loop
    execute format('drop policy if exists "%1$s_select_all" on public.%1$s', tbl);
    execute format('drop policy if exists "%1$s_insert_all" on public.%1$s', tbl);
    execute format('drop policy if exists "%1$s_update_all" on public.%1$s', tbl);
    execute format('create policy "%1$s_select_all" on public.%1$s for select using (true)', tbl);
    execute format('create policy "%1$s_insert_all" on public.%1$s for insert with check (true)', tbl);
    execute format('create policy "%1$s_update_all" on public.%1$s for update using (true) with check (true)', tbl);
  end loop;
end $$;

-- ─── Realtime subscriptions ────────────────────────────────────────────

do $$
declare
  tbl text;
  tables text[] := array[
    'campaigns', 'sessions', 'stream_ticks', 'receipts',
    'attention_profiles', 'oracle_nodes', 'oracle_submissions'
  ];
begin
  foreach tbl in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

-- ─── Backfill defaults ─────────────────────────────────────────────────

update public.campaigns set source_chain = 'solana-devnet' where source_chain is null;
