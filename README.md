# 🌌 Vista

**Real-time Attention Monetization Protocol on Solana**

Vista is a decentralized advertising infrastructure that enables users to earn USDC in real-time simply by viewing content. By leveraging Solana's high-throughput, low-latency runtime and advanced attention-tracking technology, we create a fair and transparent ecosystem for Advertisers, Publishers, and Users.

**Settlement token**: VISTA test USDC on Solana **devnet** (`2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm`) — a custom SPL mint used for the hackathon. Ask the team for test funding, or mint via the SPL CLI if you control the mint authority.

## 🚀 Live Demos

> **Note:** the previously linked URLs (`vista-base.vercel.app`, `vista-dashboard-base.vercel.app`) hosted the older **Base Sepolia EVM** build and have been retired. The Solana port is verified-working locally; redeploy is pending — see [`.superstack/deploy-checklist.md`](./.superstack/deploy-checklist.md). Demo URLs will be added here after re-deployment.

For now, run locally:

```bash
# In separate terminals, after `npm install` in each:
cd Super-Dashboard && npm run dev   # http://localhost:3031
cd Mock-Farcaster   && npm run dev   # http://localhost:3000
```

The four Anchor programs are deployed on Solana devnet (program IDs in `Solana-Program/Anchor.toml`).

---

## 🏗️ Architecture: How It Works

The Vista ecosystem consists of three primary components working in sync:

### 1. 🛠️ The Vista SDK
The core engine of the protocol. It is a lightweight JavaScript library that publishers (like social media apps or news sites) integrate into their platforms.
- **Attention Tracking:** Uses sophisticated browser signals (visibility, mouse movement, scroll depth) to verify real-time attention.
- **Heartbeat System:** Sends periodic "proof-of-attention" heartbeats to the Vista Oracle.
- **Real-time Rewards:** Triggers per-second earnings for users based on their engagement score.

### 2. 📊 Super Dashboard
A unified interface for all protocol participants to manage their activity and view analytics.

#### **For Advertisers**
Create and fund campaigns, set target metrics, and track ROI with precision.
![Advertiser Dashboard](screenshots/advertiser.png)

#### **For Publishers**
Manage ad zones, monitor site performance, and track revenue generated from hosted ads.
![Publisher Dashboard](screenshots/publisher.png)

#### **For Users**
Track lifetime earnings, view detailed session history, and manage profile preferences to receive more relevant ads.
![User Dashboard](screenshots/user.png)

### 3. 📱 Mock Farcaster (Client Simulation)
A functional demonstration of how the Vista SDK transforms a standard social media experience.
- In this mock client, users browse a Farcaster-like feed.
- When an ad enters the viewport, the SDK activates.
- A real-time reward ticker shows earnings accumulating second-by-second.
![Mock Client Earnings](screenshots/mock-getmoney.png)

---

## ⚙️ Core Components

- **Solana Programs (Anchor 1.0.2 on Solana 3.x):**
  - `vista_protocol` — campaign escrow, oracle settlement, payouts (30/50/10/10 split: user/publisher/validator/protocol fee), soulbound receipts.
  - `oracle_registry` — oracle staking, slashing, reward claims (100 USDC min stake, 7-day unstake lockup).
  - `attention_aggregator` — multi-oracle consensus, outlier detection (deviation-bps threshold), permissionless settlement that slashes outliers and credits honest oracles via CPI.
  - `vista_bridge` — cross-chain campaign reception. **Trust model:** Circle CCTP delivers USDC trustlessly into a per-campaign vault PDA; campaign metadata is gated by an `lz_executor_authority` signer (hackathon trusted-relayer mode — LayerZero V2 executor PDA migration is one constraint change away). See [Hackathon Trust Assumptions](#-hackathon-trust-assumptions) below.
- **Vista SDK** (`/sdk`): browser library publishers embed for real-time attention tracking + oracle heartbeat reporting. See [`sdk/README.md`](./sdk/README.md).
- **Oracle Node** (`/oracle-node`): stakeable Node.js service that verifies attention heartbeats, watches CCTP attestations, and submits to the aggregator.

## 🔐 Hackathon Trust Assumptions

This devnet build deliberately ships two reduced trust assumptions to keep the demo path simple. Both are flagged here so reviewers know what would change before mainnet:

### 1. Cross-chain bridge: trusted-relayer mode
`vista_bridge::receive_campaign_metadata` is gated by a single `lz_executor_authority` signer (the oracle-node admin key). For the hackathon this is intentional — it lets us exercise the campaign-bridge flow without spinning up a real LayerZero V2 endpoint. Production migration is one constraint change: swap `lz_executor_authority` for the canonical LayerZero V2 executor PDA derivation, and the rest of the receiver logic is unchanged. CCTP-side USDC delivery is already trustless (Circle's attestation + the per-campaign vault PDA address).

### 2. Aggregator min_quorum & min_stake (deployment params)
- `attention_aggregator::initialize` enforces `min_quorum >= 2` only.
- `oracle_registry::DEFAULT_MIN_STAKE = 100 USDC`.

These are fine for a devnet demo. **For mainnet:** raise `min_quorum` to a sybil-resistant floor (recommend **5–7**) and `min_stake` to a value where the cost of registering 16 sybil oracles exceeds the maximum extractable value per campaign. Deployment scripts should hard-code these.

## 🛠️ Repository Structure

- `/Solana-Program` — 4 Anchor 1.0 programs (vista_protocol, vista_bridge, oracle_registry, attention_aggregator) + tests + devnet-e2e script.
- `/sdk` — TypeScript SDK (`vista-protocol`) that publishers embed. See [`sdk/README.md`](./sdk/README.md).
- `/oracle-node` — stakeable oracle node implementation (TS + viem for EVM event watching).
- `/Super-Dashboard` — Next.js 16 dashboard (advertiser/publisher/user/oracle views).
- `/Mock-Farcaster` — Next.js 16 demo client showing real-time SDK earnings ticker.
- `/contracts/evm` — Foundry contracts for the EVM side of cross-chain advertiser deposits (`VistaGateway`).
- `/.superstack` — internal engineering docs:
  - [`security-audit.md`](./.superstack/security-audit.md) — security findings + fixes
  - [`deploy-checklist.md`](./.superstack/deploy-checklist.md) — devnet redeploy + Vercel runbook
  - [`build-context.md`](./.superstack/build-context.md) — current stack snapshot
  - [`dependency-audit.md`](./.superstack/dependency-audit.md) — version compatibility matrix
  - [`npm-audit-triage.md`](./.superstack/npm-audit-triage.md) — vuln triage

## 🧪 Run tests

```bash
cd Solana-Program
anchor test    # Surfpool-backed; expects anchor-cli 1.0.2 + surfpool 1.1.2
```

26/26 tests passing — see `Solana-Program/tests/` (vista_protocol, vista_bridge, oracle_registry, attention_aggregator).

---

Built on **Solana**.
