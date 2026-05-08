# npm Audit Triage — Super-Dashboard

**Date:** 2026-05-08

## Result

| Before | After | Action |
|---|---|---|
| **6 critical** | **0 critical** | ✅ killed Trezor → protobufjs chain |
| 5 high | 4 high | ✅ removed 1 axios path |
| 5 moderate | 3 moderate | ✅ removed coinbase-side moderates |
| 25 low | 0 low | ✅ kicked entire trezor subtree |
| **41 total** | **7 total** | **−83% surface area** |

## Fix applied

Replaced bulk import:

```diff
- import { PhantomWalletAdapter, SolflareWalletAdapter }
-   from "@solana/wallet-adapter-wallets";
+ import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
+ import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
```

`@solana/wallet-adapter-wallets` re-exports ~30 adapters (Trezor, Ledger, Coin98, etc.). We only use Phantom + Solflare. Direct imports skip the rest of the bundle, which eliminates the entire `@trezor/*` → `protobufjs` (CVE GHSA-xq3m-2v4x-88gg, RCE) chain plus a Stellar SDK → axios path.

`Super-Dashboard/package.json` swapped:
- removed `@solana/wallet-adapter-wallets@^0.19.38`
- added `@solana/wallet-adapter-phantom@^0.9.29`
- added `@solana/wallet-adapter-solflare@^0.6.33`

Verified: `npm run build` passes after change. Mock-Farcaster did not import from `wallet-adapter-wallets` (no change needed there).

## Remaining 7 vulns — risk assessment

All transitive, all upstream-blocked. Documented for visibility:

### High

| Pkg | Version | Vuln | Practical risk for Vista | Mitigation |
|---|---|---|---|---|
| `bigint-buffer` | 1.1.5 (latest) | Buffer overflow in `toBigIntLE()` | **LOW** — used by `@solana/spl-token` to decode u64 token amounts. Input comes from Solana RPC chain data (consensus-validated), not user input. No reachable attacker-controlled call site. | Wait for upstream patch (no 1.1.6 yet). |
| `axios` | 1.13.6 | SSRF via NO_PROXY bypass + cloud-metadata exfiltration | **LOW** — chain: `wagmi → @wagmi/connectors → @base-org/account → @coinbase/cdp-sdk`. Only loads when user explicitly uses Coinbase Smart Wallet onboarding. Server-side SSRF doesn't apply (axios runs in user's browser here). | Wait for `@coinbase/cdp-sdk` to bump axios to 1.14+. |
| `@solana/buffer-layout-utils` / `@solana/spl-token` | — | Re-tagged via `bigint-buffer` | Same as `bigint-buffer` row | Same |

### Moderate

| Pkg | Vuln | Practical risk | Mitigation |
|---|---|---|---|
| `next` / `postcss` | XSS via unescaped `</style>` in CSS stringify | **LOW** — exploitable only if attacker can inject CSS into a Next.js stringified output, which we don't build user-supplied CSS. | Wait for Next.js 16.3 (postcss bump). |
| `@coinbase/cdp-sdk` | Re-tagged via `axios` | Same as axios row | Same |

## Why we stop here

Every remaining vuln is:

1. **Transitive** — no direct dependency we control to bump,
2. **Upstream-blocked** — patch either does not exist (`bigint-buffer 1.1.5` IS the latest) or requires a third party to update (`@coinbase/cdp-sdk`, Next.js postcss),
3. **Low practical exploitability** for our specific use case (no attacker-controlled inputs reaching the vuln call site).

The standard `overrides` workaround in `package.json` to force-pin patched versions would only help if patched versions existed. They don't for `bigint-buffer`. For `axios` we could `overrides: { axios: "^1.14.0" }` but that risks breaking `@coinbase/cdp-sdk`'s expectations.

**Re-run cadence:** check `npm audit` every 2 weeks. If `bigint-buffer 1.1.6+` or `axios 1.14+` lands transitively, reassess.

## What was NOT done (and why)

- **`@solana/spl-token` upgrade** — already at 0.4.14 (latest); the bigint-buffer issue is its dep, not its direct issue.
- **`overrides` block in package.json** — no patched versions to pin to. Would be cargo-cult security.
- **Drop wagmi/RainbowKit** — still actively used for cross-chain advertiser deposits in the EVM flow.
