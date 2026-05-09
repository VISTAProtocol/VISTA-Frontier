# VISTA Protocol — Publisher SDK

Publishers embed this SDK to verify their users' attention to ads in real time. Each second of verified attention triggers a USDC payout split between the user (30%), the publisher (50%), oracle validators (10%), and the protocol (10%) — all settled on-chain via the [VISTA Solana programs](../Solana-Program).

## What it does

1. **Collects browser attention signals** for a tracked DOM zone (visibility, mouse activity, scroll, video progress, idle state, click rhythm).
2. **Sends signed heartbeats** every few seconds to one or more oracle nodes (fan-out via `Promise.allSettled`; in *trustless mode* the SDK polls the dashboard for the active oracle set).
3. **Calls back** with verified seconds + accumulated session amount — the publisher renders the earnings UI however they like.

The SDK is browser-only. Server-rendered frameworks (Next.js, Remix, etc.) should mount it inside `useEffect` or a `'use client'` boundary.

## Install

```bash
npm install vista-protocol
```

> Solana addresses are **base58** (e.g. `4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM`), not 0x-prefixed EVM addresses. Campaign IDs and session IDs are 32-byte hex strings.

## Quick start (vanilla TS)

```typescript
import { Vista } from "vista-protocol";

// 1. Initialize once, after the user has connected their Solana wallet.
Vista.init({
  apiKey: "vista_pub_abc123",                                 // your publisher key
  userWallet: "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM", // base58 Solana pubkey
  publisherWallet: "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
  campaignId: "0x" + "ab".repeat(32),                         // 32-byte hex (with or without 0x)
  // Trustless mode: discovers oracle URLs from the Super Dashboard's active-nodes endpoint.
  oracleUrl: "https://oracle.example.com",
  dashboardUrl: "https://your-vista-dashboard.vercel.app",
});

// 2. Attach to the DOM zone the user is viewing (an ad slot, video container, etc).
Vista.attachZone("ad-banner-1");

// 3. Render earnings as they come in.
Vista.onEarn((data) => {
  // data.sessionAmount → cumulative USDC earned this session (decimal)
  // data.tickAmount    → USDC credited in this heartbeat
  // data.validSeconds  → seconds the oracle counted as real attention
  // data.score         → 0.0–1.0 attention score for the latest tick
  // data.flagged       → true when bot-like signals were detected (debug)

  document.getElementById("earnings")!.textContent =
    `${data.sessionAmount.toFixed(6)} USDC`;
});

// 4. Detach when the zone leaves the viewport / user navigates away.
//    Auto-detaches on tab close.
Vista.detachZone();
```

## React integration

```tsx
"use client";

import { useEffect, useState } from "react";
import { Vista } from "vista-protocol";
import { useWallet } from "@solana/wallet-adapter-react";

export function AdSlot({
  campaignId,
  publisherWallet,
}: {
  campaignId: string;
  publisherWallet: string;
}) {
  const { publicKey } = useWallet();
  const [earned, setEarned] = useState(0);

  useEffect(() => {
    if (!publicKey) return;

    Vista.init({
      apiKey: process.env.NEXT_PUBLIC_VISTA_API_KEY!,
      userWallet: publicKey.toBase58(),
      publisherWallet,
      campaignId,
      oracleUrl: process.env.NEXT_PUBLIC_VISTA_ORACLE_URL!,
      dashboardUrl: process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL,
    });

    Vista.attachZone("vista-zone");
    Vista.onEarn((d) => setEarned(d.sessionAmount));

    return () => Vista.detachZone();
  }, [publicKey, campaignId, publisherWallet]);

  return (
    <div id="vista-zone">
      <video src="/ad.mp4" autoPlay muted />
      <span>Earned: {earned.toFixed(4)} USDC</span>
    </div>
  );
}
```

## Onboarding modal

Capture the user's profile (age, location, ad-category preferences) without leaving your app. The SDK ships a self-contained modal that POSTs to `${dashboardUrl}/api/users` — no styling work required:

```typescript
Vista.showOnboardingModal({
  wallet: publicKey.toBase58(),
  dashboardUrl: "https://your-vista-dashboard.vercel.app",
});
```

Call this once per user — the dashboard upserts by wallet, so re-submission is idempotent.

## Configuration reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `apiKey` | `string` | ✓ | Publisher key issued by the dashboard. |
| `userWallet` | `string` (base58) | ✓ | Solana pubkey of the connected user wallet. |
| `publisherWallet` | `string` (base58) | ✓ | Solana pubkey that receives the publisher 50% split. |
| `campaignId` | `string` (32-byte hex) | ✓ | The PDA seed for the on-chain `Campaign` account. |
| `oracleUrl` | `string \| string[]` | ✓ | One or more oracle base URLs. Heartbeats fan-out via `Promise.allSettled`. |
| `dashboardUrl` | `string` | — | Enables **trustless mode** — SDK polls `${dashboardUrl}/api/oracle/active-nodes` and broadcasts to every active oracle. Recommended. |
| `requireFullscreen` | `boolean` | — | Pauses heartbeats when the tracked element is not in fullscreen. Useful for video pre-rolls. |
| `videoElementId` | `string` | — | Specific `<video>` element id to track for `mediaProgress`. Defaults to the first `<video>` inside the attached zone. |

## API reference

| Method | Description |
|---|---|
| `Vista.init(config)` | Set up the SDK. Throws if any required field is missing. |
| `Vista.attachZone(elementId)` | Begin signal collection + heartbeat loop on `document.getElementById(elementId)`. |
| `Vista.detachZone()` | Stop heartbeats. Sends a `session_end` to the oracle. Auto-fires on `beforeunload`. |
| `Vista.onEarn(cb)` | Register a callback for every heartbeat tick. |
| `Vista.getStatus()` | Returns `{ active, sessionId, validSeconds, sessionAmount, score }`. |
| `Vista.showOnboardingModal(params)` | Renders the user-profile modal. |

## Anti-bot signals

The SDK ships these signal extractors out of the box (the oracle scores them server-side):

- DOM intersection visibility ratio
- Tab focus + page visibility
- Mouse + pointer activity (cursor velocity coefficient of variation)
- Scroll engagement
- Video `currentTime / duration` progress
- `IdleDetector` user state (Chrome) — `active` vs `idle`
- Click rhythm coefficient of variation (rejects bot-like uniform clicks)

Detection thresholds are oracle-side; the SDK just reports raw signals.

## Build & develop

```bash
npm install
npm run build      # bundle to dist/ (cjs + esm)
npm run dev        # tsup watch mode
```

The SDK is consumed inside this monorepo by `Mock-Farcaster` via `vista-protocol: file:../sdk` — Mock-Farcaster aliases the package to `src/lib/vista-sdk/index.mjs` for live development.

## License

MIT
