# Deploy Checklist — Vista Frontier (devnet)

**Last updated:** 2026-05-08

## Status snapshot

| Layer | Devnet status | Action needed |
|---|---|---|
| 4 Anchor programs | ✅ deployed at expected IDs (authority `FRTMLy9suBCQYGya341V4urVedMJXFg21dDw4CTn43Ke`) | **Redeploy** — current devnet bytecode is pre-security-fix (CR-1, HI-1/2, ME-1 not on-chain yet) |
| Super-Dashboard hosted demo | hosted at vista-dashboard-base.vercel.app — **stale Base Sepolia build** | Vercel redeploy from this branch |
| Mock-Farcaster hosted demo | hosted at vista-base.vercel.app — **stale Base Sepolia build** | Vercel redeploy from this branch |
| Frontend env vars | `.env.example` complete; local `.env` may be partial | Verify Solana `*_PROGRAM_ID` keys in `.env` match `.env.example` |

## Programs — redeploy steps

```bash
cd Solana-Program

# Verify wallet matches deployed authority
solana address  # must equal FRTMLy9suBCQYGya341V4urVedMJXFg21dDw4CTn43Ke

# Redeploy all 4 (anchor 1.0 still requires explicit cluster flag because we
# left [provider] cluster = "localnet" in Anchor.toml so `anchor test` uses
# Surfpool by default).
anchor build
anchor deploy --provider.cluster devnet

# Update IDL (security fixes added new instructions + accounts):
#   - vista_protocol: refund_stuck_validator_pool
#   - attention_aggregator: SubmitVerification.registry account, new errors
anchor idl upgrade --filepath target/idl/vista_protocol.json \
  4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM \
  --provider.cluster devnet
anchor idl upgrade --filepath target/idl/attention_aggregator.json \
  6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH \
  --provider.cluster devnet
anchor idl upgrade --filepath target/idl/vista_bridge.json \
  9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE \
  --provider.cluster devnet
anchor idl upgrade --filepath target/idl/oracle_registry.json \
  Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn \
  --provider.cluster devnet

# Smoke test against devnet (skips program redeploy):
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-node scripts/devnet-e2e.ts
```

**Existing devnet PDAs** (config, registry, aggregator_config) are still valid after a program upgrade — Anchor's account discriminators don't change. New instructions just become callable. No re-init required.

## Frontends — Vercel redeploy

### Super-Dashboard (`vista-dashboard-base.vercel.app`)

Recommend renaming the project to `vista-dashboard` (drops the `-base` suffix that was tied to the old Base Sepolia deployment).

```bash
cd Super-Dashboard
vercel link    # link to the existing project (or create new with new name)
vercel --prod  # deploys current branch as production
```

Required env vars in Vercel project settings (must mirror `.env.example`):

```
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_VISTA_PROTOCOL_PROGRAM_ID=4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM
NEXT_PUBLIC_VISTA_BRIDGE_PROGRAM_ID=9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE
NEXT_PUBLIC_ORACLE_REGISTRY_PROGRAM_ID=Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn
NEXT_PUBLIC_ATTENTION_AGGREGATOR_PROGRAM_ID=6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH
NEXT_PUBLIC_USDC_MINT=2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm
NEXT_PUBLIC_VISTA_FEE_WALLET=<vista wallet pubkey>
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>

# Server-only:
SUPABASE_SERVICE_ROLE_KEY=<your supabase service role>
NEXT_PUBLIC_SUPABASE_URL=<supabase url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon>
ORACLE_WEBHOOK_SECRET=<random hex>
JWT_SECRET=<random hex>

# EVM cross-chain (only if VistaGateway is redeployed for the new flow):
NEXT_PUBLIC_VISTA_GATEWAY_BASE_SEPOLIA=<addr>
NEXT_PUBLIC_VISTA_GATEWAY_ARB_SEPOLIA=<addr>
```

### Mock-Farcaster (`vista-base.vercel.app`)

Similar — recommend renaming to `vista-mock-farcaster`.

```bash
cd Mock-Farcaster
vercel link
vercel --prod
```

Required env vars: same Solana keys as Super-Dashboard (no `NEXT_PUBLIC_VISTA_FEE_WALLET` needed unless it's used in this app — verify before launch).

## Local runtime status (verified 2026-05-08)

- ✅ Super-Dashboard `npm run dev` boots cleanly (with `--webpack` flag); 9/9 page routes return 200; all API routes return correct status codes (200/404/405) when called with proper params.
- ✅ Mock-Farcaster `npm run dev` boots; all 3 page routes work; middleware redirect to `/auth` on protected route works.

## Known warnings (non-blocking)

- Mock-Farcaster: `middleware.js` deprecated in Next 16 — works for now but should be renamed to `proxy.js` before Next 17.
- Super-Dashboard: must use `--webpack` flag because `next.config.mjs` has webpack alias config; Turbopack migration is a future cleanup.
- Both apps: `bigint: Failed to load bindings, pure JS will be used` warning is harmless (native bigint addon not built; pure-JS fallback works).

## Pre-launch checklist

Before flipping demo URLs to public:

- [ ] Programs redeployed (current devnet bytecode is pre-security-fix)
- [ ] IDL upgraded (so dashboards can decode new accounts)
- [ ] `.env` populated with Solana program IDs (compare against `.env.example`)
- [ ] Vercel env vars set (mirror `.env`)
- [ ] Smoke-test wallet connect Phantom + Solflare in deployed build
- [ ] One full E2E happy path: deposit campaign → start session → tick → end → claim receipt
- [ ] README live-demo URLs point to NEW deployment
- [ ] Old EVM contract addresses removed from `.env` (clean slate)
