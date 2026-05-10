create extension if not exists pgcrypto;

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
  chain text not null default 'base-sepolia',
  created_at timestamptz not null default now()
);

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

alter table public.stream_ticks
  add column if not exists validator_amount numeric not null default 0;
alter table public.stream_ticks
  add column if not exists vista_amount numeric not null default 0;

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

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  token_id text not null,
  session_id_onchain text not null,
  user_wallet text not null,
  advertiser_wallet text not null,
  campaign_id_onchain text not null,
  chain text not null default 'base-sepolia',
  chain_id integer null,
  platform text null,
  seconds_verified integer not null,
  usdc_paid numeric not null,
  minted_at timestamptz not null
);

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

create index if not exists idx_publishers_wallet on public.publishers (wallet_address);
create index if not exists idx_advertisers_wallet on public.advertisers (wallet_address);
create index if not exists idx_campaigns_advertiser_wallet on public.campaigns (advertiser_wallet);
create index if not exists idx_campaigns_active on public.campaigns (active);
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
create index if not exists idx_attention_profiles_wallet on public.attention_profiles (wallet_address);
create index if not exists idx_oracle_nodes_active on public.oracle_nodes (active);
create index if not exists idx_oracle_submissions_session on public.oracle_submissions (session_id_onchain);
create index if not exists idx_oracle_submissions_oracle on public.oracle_submissions (oracle_pubkey);

alter table public.users enable row level security;
alter table public.publishers enable row level security;
alter table public.advertisers enable row level security;
alter table public.campaigns enable row level security;
alter table public.sessions enable row level security;
alter table public.stream_ticks enable row level security;
alter table public.receipts enable row level security;
alter table public.attention_profiles enable row level security;
alter table public.oracle_nodes enable row level security;
alter table public.oracle_submissions enable row level security;

drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_insert_all" on public.users;
drop policy if exists "users_update_all" on public.users;
create policy "users_select_all" on public.users for select using (true);
create policy "users_insert_all" on public.users for insert with check (true);
create policy "users_update_all" on public.users for update using (true) with check (true);

drop policy if exists "publishers_select_all" on public.publishers;
drop policy if exists "publishers_insert_all" on public.publishers;
drop policy if exists "publishers_update_all" on public.publishers;
create policy "publishers_select_all" on public.publishers for select using (true);
create policy "publishers_insert_all" on public.publishers for insert with check (true);
create policy "publishers_update_all" on public.publishers for update using (true) with check (true);

drop policy if exists "advertisers_select_all" on public.advertisers;
drop policy if exists "advertisers_insert_all" on public.advertisers;
drop policy if exists "advertisers_update_all" on public.advertisers;
create policy "advertisers_select_all" on public.advertisers for select using (true);
create policy "advertisers_insert_all" on public.advertisers for insert with check (true);
create policy "advertisers_update_all" on public.advertisers for update using (true) with check (true);

drop policy if exists "campaigns_select_all" on public.campaigns;
drop policy if exists "campaigns_insert_all" on public.campaigns;
drop policy if exists "campaigns_update_all" on public.campaigns;
create policy "campaigns_select_all" on public.campaigns for select using (true);
create policy "campaigns_insert_all" on public.campaigns for insert with check (true);
create policy "campaigns_update_all" on public.campaigns for update using (true) with check (true);

drop policy if exists "sessions_select_all" on public.sessions;
drop policy if exists "sessions_insert_all" on public.sessions;
drop policy if exists "sessions_update_all" on public.sessions;
create policy "sessions_select_all" on public.sessions for select using (true);
create policy "sessions_insert_all" on public.sessions for insert with check (true);
create policy "sessions_update_all" on public.sessions for update using (true) with check (true);

drop policy if exists "stream_ticks_select_all" on public.stream_ticks;
drop policy if exists "stream_ticks_insert_all" on public.stream_ticks;
drop policy if exists "stream_ticks_update_all" on public.stream_ticks;
create policy "stream_ticks_select_all" on public.stream_ticks for select using (true);
create policy "stream_ticks_insert_all" on public.stream_ticks for insert with check (true);
create policy "stream_ticks_update_all" on public.stream_ticks for update using (true) with check (true);

drop policy if exists "receipts_select_all" on public.receipts;
drop policy if exists "receipts_insert_all" on public.receipts;
drop policy if exists "receipts_update_all" on public.receipts;
create policy "receipts_select_all" on public.receipts for select using (true);
create policy "receipts_insert_all" on public.receipts for insert with check (true);
create policy "receipts_update_all" on public.receipts for update using (true) with check (true);

drop policy if exists "attention_profiles_select_all" on public.attention_profiles;
drop policy if exists "attention_profiles_insert_all" on public.attention_profiles;
drop policy if exists "attention_profiles_update_all" on public.attention_profiles;
create policy "attention_profiles_select_all" on public.attention_profiles for select using (true);
create policy "attention_profiles_insert_all" on public.attention_profiles for insert with check (true);
create policy "attention_profiles_update_all" on public.attention_profiles for update using (true) with check (true);

drop policy if exists "oracle_nodes_select_all" on public.oracle_nodes;
drop policy if exists "oracle_nodes_insert_all" on public.oracle_nodes;
drop policy if exists "oracle_nodes_update_all" on public.oracle_nodes;
create policy "oracle_nodes_select_all" on public.oracle_nodes for select using (true);
create policy "oracle_nodes_insert_all" on public.oracle_nodes for insert with check (true);
create policy "oracle_nodes_update_all" on public.oracle_nodes for update using (true) with check (true);

drop policy if exists "oracle_submissions_select_all" on public.oracle_submissions;
drop policy if exists "oracle_submissions_insert_all" on public.oracle_submissions;
drop policy if exists "oracle_submissions_update_all" on public.oracle_submissions;
create policy "oracle_submissions_select_all" on public.oracle_submissions for select using (true);
create policy "oracle_submissions_insert_all" on public.oracle_submissions for insert with check (true);
create policy "oracle_submissions_update_all" on public.oracle_submissions for update using (true) with check (true);

alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.stream_ticks;
alter publication supabase_realtime add table public.receipts;
alter publication supabase_realtime add table public.attention_profiles;
alter publication supabase_realtime add table public.oracle_nodes;
alter publication supabase_realtime add table public.oracle_submissions;

-- ─────────────────── Cross-chain advertiser deposits ───────────────────
-- USDC bridges from Base Sepolia / Arbitrum Sepolia → Solana via Circle CCTP
-- (USDC burn/mint) plus LayerZero V2 (campaign metadata). Solana stays the
-- only settlement layer; these columns track the bridge lifecycle.

alter table public.campaigns
  add column if not exists source_chain text,
  add column if not exists advertiser_evm_address text,
  add column if not exists bridge_status text default 'native',
  add column if not exists cctp_nonce bigint,
  add column if not exists source_chain_tx_hash text,
  add column if not exists lz_message_hash text,
  add column if not exists bridged_at timestamptz;

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

create index if not exists campaigns_bridge_status_idx
  on public.campaigns(bridge_status) where bridge_status <> 'native';
create index if not exists campaigns_cctp_nonce_idx
  on public.campaigns(cctp_nonce) where cctp_nonce is not null;

-- Backfill: existing rows predate cross-chain. The legacy `chain` column
-- (line 41) had a misleading default of 'base-sepolia'; treat `source_chain`
-- as the new source of truth.
update public.campaigns set source_chain = 'solana-devnet'
  where source_chain is null;

-- ─────────────────── Vault ledger (credits / withdrawals) ───────────────────
-- Per-wallet ledger fed by vista_protocol StreamTick (Credited) and Withdrawn
-- events. `getVaultBalance(wallet)` aggregates these for the user and
-- publisher dashboards. role: 0 = user, 1 = publisher.

create table if not exists public.vault_credits (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  session_id_onchain text not null,
  campaign_id_onchain text not null,
  amount numeric not null,
  role smallint not null,
  credited_at timestamptz not null default now()
);

create table if not exists public.vault_withdrawals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  amount numeric not null,
  withdrawn_at timestamptz not null default now()
);

create index if not exists idx_vault_credits_wallet
  on public.vault_credits(wallet_address);
create index if not exists idx_vault_credits_session
  on public.vault_credits(session_id_onchain);
create index if not exists idx_vault_withdrawals_wallet
  on public.vault_withdrawals(wallet_address);

alter table public.vault_credits enable row level security;
alter table public.vault_withdrawals enable row level security;

drop policy if exists "vault_credits_select_all" on public.vault_credits;
drop policy if exists "vault_credits_insert_all" on public.vault_credits;
create policy "vault_credits_select_all" on public.vault_credits for select using (true);
create policy "vault_credits_insert_all" on public.vault_credits for insert with check (true);

drop policy if exists "vault_withdrawals_select_all" on public.vault_withdrawals;
drop policy if exists "vault_withdrawals_insert_all" on public.vault_withdrawals;
create policy "vault_withdrawals_select_all" on public.vault_withdrawals for select using (true);
create policy "vault_withdrawals_insert_all" on public.vault_withdrawals for insert with check (true);

alter publication supabase_realtime add table public.vault_credits;
alter publication supabase_realtime add table public.vault_withdrawals;

-- ─────────────────── Cross-platform attention identity (REMOVED) ───────────────────
-- Earlier iteration linked end-user EVM wallets to a Solana primary identity
-- ("watch with EVM, settle on Solana"). Removed in favor of pure Solana-only
-- end users + advertiser-side multi-chain deposit (CCTP inflow).
--
-- This idempotent block drops the table if it exists from prior iterations.

drop table if exists public.linked_wallets cascade;
