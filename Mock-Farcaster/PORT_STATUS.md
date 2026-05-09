# Solana Port Status — Mock-Farcaster

## ✅ Done

| File | Status |
|---|---|
| [package.json](package.json) | swapped `wagmi`/`viem` → `@solana/wallet-adapter-*` + `@coral-xyz/anchor` + `@solana/web3.js`. Also fixed `vista-protocol: file:../sdk` (was pointing at deleted `Smart-Contract`). |
| [src/modules/auth/Web3Provider.js](src/modules/auth/Web3Provider.js) | Solana wallet adapter providers (Phantom + Solflare) |
| [src/app/auth/page.js](src/app/auth/page.js) | wallet connect via wallet-adapter modal; SIWE replaced with simple connection check |
| [src/lib/solana.js](src/lib/solana.js) | constants (RPC, USDC mint, program ID) |
| ~~[src/lib/auth/base-sepolia-chain.js](src/lib/auth/base-sepolia-chain.js)~~ | DELETED |

## ⚠️ Remaining

These files still import wagmi/viem and need the same swap:

| File | Notes |
|---|---|
| `src/app/api/auth/verify/route.js` | SIWE verifier endpoint. Either delete (no auth) or rewrite to verify a Solana signature with `tweetnacl`. |
| `src/app/api/campaigns/route.js` | uses `viem` for hex utilities — replace with browser `crypto.subtle` digest |
| `src/modules/home/components/TrendingSection.js` | likely uses `useAccount` — swap to `useWallet().publicKey` |

## Auth simplification

The original SIWE flow signed a message and POSTed to `/api/auth/nonce` and `/api/auth/verify` to mint a session JWT. For the hackathon scope, the new auth page (`src/app/auth/page.js`) just checks `connected` from `useWallet()` and routes the user. The Vista onboarding modal still launches when the user is unregistered.

If you need persistent server sessions on Solana, implement Sign-In with Solana (SIWS):

1. Server generates nonce, returns to client.
2. Client signs nonce with wallet (`signMessage` from `useWallet`).
3. Server verifies signature via `tweetnacl.sign.detached.verify(message, signature, publicKey)`.
4. Set JWT cookie.

## Install + run

```bash
npm install
npm run dev
```

Notes about Next.js 16:
- Per [AGENTS.md](AGENTS.md), this Next has breaking changes from training data. If a route handler or middleware fails, check `node_modules/next/dist/docs/`.
- Wallet adapter UI styles (`@solana/wallet-adapter-react-ui/styles.css`) are imported in `Web3Provider.js`. If Tailwind 4 swallows them, ensure they load before tailwind layers.

## Environment variables

```env
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_VISTA_PROTOCOL_PROGRAM_ID=4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM
NEXT_PUBLIC_USDC_MINT=2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm
NEXT_PUBLIC_VISTA_DASHBOARD_URL=http://localhost:3031
```
