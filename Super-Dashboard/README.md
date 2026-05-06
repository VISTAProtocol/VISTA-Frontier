# VISTA Protocol Dashboard

Next.js 14 dashboard for VISTA Protocol, a real-time attention monetization protocol where users earn USDC for verified ad viewing across Web3 platforms.

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS + shadcn/ui
- RainbowKit + wagmi on Base Sepolia
- Supabase PostgreSQL + Realtime
- Recharts

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_VISTA_STREAM_ADDRESS=
NEXT_PUBLIC_VISTA_ESCROW_ADDRESS=
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_BASE_RPC=https://sepolia.base.org
NEXT_PUBLIC_ORACLE_WS_URL=
ORACLE_WEBHOOK_SECRET=
```

`NEXT_PUBLIC_ORACLE_WS_URL` is included because the live user counter listens to the Oracle WebSocket directly.

## Setup Supabase

1. Create a new Supabase project.
2. Open SQL Editor.
3. Run [`supabase/schema.sql`](./supabase/schema.sql).
4. In Supabase Realtime settings, make sure table replication is enabled for:
   `campaigns`, `sessions`, `stream_ticks`, and `receipts`.
5. Copy the project URL and anon key into `.env.local`.

The SQL file includes:

- all requested tables
- basic indexes for wallet and on-chain IDs
- permissive hackathon policies so route handlers work with the anon key
- publication updates for realtime tables

## Install And Run

```bash
npm install
npm run dev
```

If you prefer pnpm, `pnpm install` also works.

## Demo Mode

When Supabase env vars or contract addresses are missing, the app still renders using local mock data so the product flow remains explorable. On-chain launch/refund actions fall back to demo-mode notifications until contract env vars are configured.

## Important Routes

- `/` landing page + role selector
- `/advertiser/*` advertiser onboarding, dashboard, campaigns, and campaign detail
- `/publisher/*` publisher onboarding, dashboard, and analytics
- `/user/*` user onboarding, live earnings dashboard, and history

## API Routes

- `POST /api/users`
- `GET /api/users/[wallet]`
- `POST /api/publishers`
- `GET /api/publishers/[wallet]/analytics`
- `POST /api/advertisers`
- `POST /api/campaigns`
- `GET /api/campaigns/active`
- `POST /api/sessions`
- `POST /api/ticks`
- `POST /api/receipts`

Additional internal routes are included for dashboard data, role access checks, campaign detail, and user history.
