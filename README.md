# 🌌 Vista 

**Real-time Attention Monetization Protocol on Base Sepolia**

Vista is a decentralized advertising infrastructure that enables users to earn USDC in real-time simply by viewing content. By leveraging high-throughput blockchain (Base Sepolia) and advanced attention-tracking technology, we create a fair and transparent ecosystem for Advertisers, Publishers, and Users.

## 🚀 Live Demos

- **Mock Farcaster Client:** [https://vista-base.vercel.app/](https://vista-base.vercel.app/)
- **Protocol Dashboard:** [http://vista-dashboard-base.vercel.app/](http://vista-dashboard-base.vercel.app/)

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
- A real-time USDC ticker shows earnings accumulating second-by-second.
![Mock Client Earnings](screenshots/mock-getmoney.png)

---

## ⚙️ Core Components

- **Smart Contracts:** Deployed on Base Sepolia, handling secure settlement and session-based NFT receipt minting.
- **Oracle Server:** Verifies attention signals and signs reward claims to prevent bot activity.
- **Ponder Indexer:** Provides lightning-fast data for the dashboard analytics.

## 📜 Deployment Addresses (Base Sepolia)

| Contract | Address |
| :--- | :--- |
| **MockUSDC** | `0xc1E4d04ACe35A360D01f820cEB5f29Dea49f4eA7` |
| **VistaEscrow** | `0x0Fb9A8303c2c058223d82384E13FF5295b0ec033` |
| **VistaReceipt** | `0x03e2b98453BCe7E41897af50969B535354DcfD0b` |
| **VistaStream** | `0x10d3340fd8F760997FF5be2BcEBf8893FEECEeCF` |
| **VistaVault** | `0x7D75f5c1817fd5B7eb0d110C67dF08493705AA10` |

## 🛠️ Repository Structure

- `/Smart-Contract`: Core Solidity contracts and the `@vista-protocol/sdk` source.
- `/Super-Dashboard`: Next.js application for the protocol management UI.
- `/Mock-Farcaster`: Example integration showing the SDK in a social media context.
- `/Oracle-Server-Production`: Backend verification engine.
- `/Ponder-Production`: Real-time indexing service.

---

Built on **Base Sepolia**.
