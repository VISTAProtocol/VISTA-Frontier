-- ─────────────────── Demo seed for cross-platform identity ───────────────────
-- Run in Supabase SQL editor (or psql) AFTER running schema.sql.
-- Idempotent: re-running is safe.
--
-- What this creates:
--   1. users row for the demo Solana primary wallet
--   2. linked_wallets row mapping the demo Solana → demo EVM (Base Sepolia)
--   3. one demo campaign on Base Sepolia (so category_diversity > 0)
--   4. 6 receipts keyed to the EVM address (varied seconds_verified, mostly
--      ≥ ATTENTION_CONSISTENCY_MIN_SECONDS so consistency_rate > 0)
--
-- After seeding: log into the dashboard with the demo Solana wallet,
-- visit /user/identity, sign in, and the aggregated attention card will
-- show the EVM source weighted at 0.7.
--
-- Replace the two addresses below with your own demo wallets if needed.

\set primary_solana '6KrgsnHi3qB2MhixCw5W8m5p5Fz4xLPp3J5w8xXQwQqK'
\set secondary_evm  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF'

-- 1. Primary user (Solana)
insert into public.users (wallet_address)
values ('6KrgsnHi3qB2MhixCw5W8m5p5Fz4xLPp3J5w8xXQwQqK')
on conflict (wallet_address) do nothing;

-- 2. Linked wallet (EVM Base Sepolia)
--    NOTE: verification_message / verification_signature are dummy values
--    here because seeding bypasses the SIWE flow. Real links from the UI
--    store the actual signed challenge.
insert into public.linked_wallets (
  primary_wallet, secondary_wallet, secondary_chain,
  reputation_weight, verification_message, verification_signature
)
values (
  '6KrgsnHi3qB2MhixCw5W8m5p5Fz4xLPp3J5w8xXQwQqK',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
  'base-sepolia',
  0.7,
  'SEED — bypassed SIWE flow for demo data',
  '0xSEED'
)
on conflict (secondary_wallet, secondary_chain) do nothing;

-- 3. Demo campaign on Base Sepolia (so receipts have a parent campaign with
--    target_preferences for category_diversity calc).
insert into public.campaigns (
  campaign_id_onchain, advertiser_wallet, title, creative_url, target_url,
  total_budget, remaining_budget, rate_per_second, target_preferences,
  active, chain, source_chain, bridge_status
)
values (
  'demo-evm-campaign-001',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
  'Demo Cross-Chain Campaign',
  'https://placehold.co/600x400',
  'https://example.com',
  1000, 1000, 0.001,
  array['gaming','defi'],
  true,
  'base-sepolia',
  'base-sepolia',
  'active'
)
on conflict (campaign_id_onchain) do nothing;

-- 4. Receipts keyed to EVM address. Mix of values so consistency_rate
--    becomes meaningful (most ≥ 30s threshold, a few below).
insert into public.receipts (
  token_id, session_id_onchain, user_wallet, advertiser_wallet,
  campaign_id_onchain, chain, chain_id, platform,
  seconds_verified, usdc_paid, minted_at
)
values
  ('seed-evm-r-001', 'seed-evm-s-001', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 90, 0.090, now() - interval '5 days'),
  ('seed-evm-r-002', 'seed-evm-s-002', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 60, 0.060, now() - interval '4 days'),
  ('seed-evm-r-003', 'seed-evm-s-003', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 45, 0.045, now() - interval '3 days'),
  ('seed-evm-r-004', 'seed-evm-s-004', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 75, 0.075, now() - interval '2 days'),
  ('seed-evm-r-005', 'seed-evm-s-005', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 20, 0.020, now() - interval '1 day'),
  ('seed-evm-r-006', 'seed-evm-s-006', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF',
   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbF', 'demo-evm-campaign-001',
   'base-sepolia', 84532, 'farcaster-evm', 50, 0.050, now() - interval '6 hours')
on conflict do nothing;

-- Quick verify
select 'linked_wallets' as table_name, count(*) from public.linked_wallets
union all
select 'receipts (evm seed)', count(*) from public.receipts where chain = 'base-sepolia' and platform = 'farcaster-evm';
