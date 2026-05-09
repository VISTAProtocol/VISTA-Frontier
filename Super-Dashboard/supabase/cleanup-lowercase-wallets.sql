-- One-shot cleanup after the normalizeWallet bug.
--
-- Background: Supabase rows where `wallet_address` / `user_wallet` /
-- `publisher_wallet` / `advertiser_wallet` were stored after going through
-- the buggy `normalizeWallet` (which lowercased Solana base58 pubkeys).
-- These rows reference phantom 32-byte sequences that no Solana wallet can
-- actually sign for, so funds are stranded and dashboards can't match
-- writes back to the connected wallet.
--
-- Recovery: there is no programmatic way to recover the original case from
-- a lowercased base58 pubkey, so the only path is to delete affected rows
-- and have each role re-register from the dashboard. After the fix to
-- `normalizeWallet`, future writes preserve the original case.
--
-- This script is idempotent. Run it once, then re-register publisher /
-- advertiser / user / oracle accounts via the dashboard. Oracle nodes are
-- preserved because the backfill script wrote them case-correctly.

begin;

-- Off-chain ledgers fed by oracle sync events. Drop everything — the chain
-- is the source of truth and tick_stream events will repopulate cleanly.
truncate table public.vault_credits;
truncate table public.vault_withdrawals;
truncate table public.stream_ticks;
truncate table public.sessions;
truncate table public.receipts;
truncate table public.oracle_submissions;

-- Role tables. Re-register from the dashboard after this — the new writes
-- will keep the case-correct base58 pubkey.
truncate table public.users cascade;
truncate table public.publishers cascade;
truncate table public.advertisers cascade;

-- Campaigns reference advertiser_wallet, which was lowercased — drop them
-- too so the new advertiser registers fresh and creates new campaigns.
-- (The on-chain campaigns still exist; you can either re-fund them or
-- spawn new ones.)
truncate table public.campaigns cascade;

-- Attention profile rows are keyed by user wallet — also lowercased.
truncate table public.attention_profiles cascade;

-- Keep oracle_nodes intact: they were re-hydrated by the backfill script
-- using raw case-correct base58 from on-chain.

commit;
