# VISTA Protocol — Smart Contract & SDK

This repository contains the core Solidity smart contracts and the JavaScript/TypeScript SDK for the VISTA Protocol on Base.

---

## 📦 JavaScript/TypeScript SDK

SDK for [VISTA Protocol](https://vista.xyz) — real-time attention monetization for Web3 platforms.

Publishers install this SDK to collect browser attention signals and send heartbeats to the VISTA Oracle, enabling per-second USDC earnings for their users.

### Install

```bash
npm install vista-protocol
```

### Quick Start

```typescript
import { Vista } from "vista-protocol";

// Step 1 — Initialize once, after wallet is connected
Vista.init({
  apiKey: "vista_pub_abc123",
  userWallet: "0xUSER...",
  oracleUrl: "https://oracle.vista.xyz",
  campaignId: "campaign_xyz",
  publisherWallet: "0xPUBLISHER...",
});

// Step 2 — Attach to your ad/content element
Vista.attachZone("ad-banner");

// Step 3 — Handle earnings your way
Vista.onEarn((data) => {
  // data.sessionAmount → total earned this session (USDC estimate)
  // data.validSeconds  → verified attention seconds
  // data.score         → current attention score (0.0 – 1.0)
  // data.tickAmount    → amount earned in this tick
  // data.flagged       → true if bot activity suspected (debug only)

  setEarned(data.sessionAmount);
  setSeconds(data.validSeconds);
});

// Step 4 — Detach when done (optional — auto-detaches on tab close)
Vista.detachZone();
```

### Onboarding Modal

VISTA provides a native onboarding modal to capture user profile data (age, location, preferences) without leaving your app.

```typescript
Vista.showOnboardingModal({
  wallet: "0xUSER...",
  dashboardUrl: "http://localhost:3031", // optional, defaults to localhost:3031
});
```

### API Reference

#### `Vista.init(config: VistaConfig): void`

Initializes the SDK. Must be called before `attachZone()`.

#### `Vista.attachZone(elementId: string): void`

Begins collecting signals for the given element.

#### `Vista.showOnboardingModal(params: OnboardingParams): void`

Displays the profile registration modal.

#### `Vista.detachZone(): void`

Stops the heartbeat loop.

#### `Vista.onEarn(callback: (data: EarnCallbackData) => void): void`

Registers a callback for attention ticks.

---

## 🛠 Smart Contracts (Foundry)

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

### Usage

#### Build

```shell
$ forge build
```

#### Test

```shell
$ forge test
```

#### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Documentation

https://book.getfoundry.sh/

---

## License

MIT
