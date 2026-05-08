# 🌌 Vista

**Real-time Attention Monetization Protocol on Solana**

Vista is a decentralized advertising infrastructure that enables users to earn USDC in real-time simply by viewing content. By leveraging Solana's high-throughput, low-latency runtime and advanced attention-tracking technology, we create a fair and transparent ecosystem for Advertisers, Publishers, and Users.

**Settlement token**: Circle's official test USDC on Solana **devnet** (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`). Get test USDC from [faucet.circle.com](https://faucet.circle.com).

## 🚀 Live Demos

- **Mock Farcaster Client:** [https://vista-base.vercel.app/](https://vista-base.vercel.app/)
- **Protocol Dashboard:** [http://vista-dashboard-base.vercel.app/](http://vista-dashboard-base.vercel.app/)

> Note: live demos still point at the previous Base Sepolia deployment. Migration to Solana is in progress.

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

- **Solana Programs:** Anchor programs handling settlement, rewards minting, and cross-chain bridging via LayerZero V2.
- **Vista SDK:** Browser library for attention tracking and heartbeat reporting.

## 🔐 Hackathon Trust Assumptions

This devnet build deliberately ships two reduced trust assumptions to keep the demo path simple. Both are flagged here so reviewers know what would change before mainnet:

### 1. Cross-chain bridge: trusted-relayer mode
`vista_bridge::receive_campaign_metadata` is gated by a single `lz_executor_authority` signer (the oracle-node admin key). For the hackathon this is intentional — it lets us exercise the campaign-bridge flow without spinning up a real LayerZero V2 endpoint. Production migration is one constraint change: swap `lz_executor_authority` for the canonical LayerZero V2 executor PDA derivation, and the rest of the receiver logic is unchanged. CCTP-side USDC delivery is already trustless (Circle's attestation + the per-campaign vault PDA address).

### 2. Aggregator min_quorum & min_stake (deployment params)
- `attention_aggregator::initialize` enforces `min_quorum >= 2` only.
- `oracle_registry::DEFAULT_MIN_STAKE = 100 USDC`.

These are fine for a devnet demo. **For mainnet:** raise `min_quorum` to a sybil-resistant floor (recommend **5–7**) and `min_stake` to a value where the cost of registering 16 sybil oracles exceeds the maximum extractable value per campaign. Deployment scripts should hard-code these.

## 🛠️ Repository Structure

- `/Solana-Program`: Anchor programs (e.g. `vista_bridge`) for the Solana runtime.
- `/sdk`: TypeScript SDK (`vista-protocol`) that publishers embed in their apps.
- `/Super-Dashboard`: Next.js application for the protocol management UI (porting to Solana).
- `/Mock-Farcaster`: Example integration showing the SDK in a social media context (porting to Solana).

---

Built on **Solana**.
