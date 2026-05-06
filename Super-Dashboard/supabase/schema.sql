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

alter table public.users enable row level security;
alter table public.publishers enable row level security;
alter table public.advertisers enable row level security;
alter table public.campaigns enable row level security;
alter table public.sessions enable row level security;
alter table public.stream_ticks enable row level security;
alter table public.receipts enable row level security;
alter table public.attention_profiles enable row level security;

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

alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.stream_ticks;
alter publication supabase_realtime add table public.receipts;
alter publication supabase_realtime add table public.attention_profiles;
