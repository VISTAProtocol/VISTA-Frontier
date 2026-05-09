# Solana Port Status

Tracking the EVM → Solana port. The foundation is in place; remaining pages need to be ported using the same patterns.

## ✅ Done — foundation

| File | Status |
|---|---|
| [package.json](package.json) | swapped `wagmi`/`viem`/`@rainbow-me/rainbowkit`/`siwe` → `@solana/wallet-adapter-*` + `@coral-xyz/anchor` + `@solana/web3.js` + `@solana/spl-token` |
| [components/providers.tsx](components/providers.tsx) | Solana wallet adapter providers (Phantom + Solflare) |
| [components/wallet-connect-button.tsx](components/wallet-connect-button.tsx) | Solana modal connect |
| [app/layout.tsx](app/layout.tsx) | wagmi `cookieToInitialState` removed |
| [lib/solana.ts](lib/solana.ts) | constants (RPC, USDC mint, program IDs) + PDA helpers + explorer URL |
| [lib/anchor-client.ts](lib/anchor-client.ts) | Anchor program instantiation, `bytes32FromSeed` (SHA-256) |
| [lib/use-vista-program.ts](lib/use-vista-program.ts) | hook returning a wallet-bound program client |
| [lib/vista-actions.ts](lib/vista-actions.ts) | typed wrappers: `depositCampaign`, `withdraw`, `fetchUserBalance`, `fetchCampaign` |
| [lib/idl/vista_protocol.json](lib/idl/vista_protocol.json) | IDL copied from `Solana-Program/target/idl/` |
| [lib/anchor/vista_protocol.ts](lib/anchor/vista_protocol.ts) | TypeScript types from anchor build |
| [lib/utils.ts](lib/utils.ts) | `bytes32FromSeed` now async SHA-256, `buildExplorerUrl` → Solana Explorer, `truncateAddress` for base58 |

## ✅ Done — example flow ported end-to-end

| File | Status |
|---|---|
| [app/advertiser/campaigns/new/page.tsx](app/advertiser/campaigns/new/page.tsx) | `handleSubmit` rewritten with Anchor `depositCampaign`. Use this as the template for other pages. |

## ⚠️ Remaining — needs port

These files still import `wagmi`/`viem`/`@/lib/contracts`/`@/lib/wagmi` and won't compile until ported.

| File | What to swap |
|---|---|
| `app/page.tsx` | `useAccount` → `useWallet` from `@solana/wallet-adapter-react` |
| `app/advertiser/dashboard/page.tsx` | replace `readContract`/`useReadContract` with Anchor `program.account.<state>.fetch` |
| `app/advertiser/campaigns/page.tsx` | same as dashboard |
| `app/advertiser/campaigns/[id]/page.tsx` | `vistaEscrowAbi` deposit/refund → `program.methods.depositCampaign`/`refundCampaign` |
| `app/advertiser/onboarding/page.tsx` | wallet check |
| `app/publisher/dashboard/page.tsx` | balance fetch via `fetchUserBalance` |
| `app/publisher/onboarding/page.tsx` | wallet check |
| `app/user/dashboard/page.tsx` | `vistaVaultAbi.withdraw` → `withdraw` from `vista-actions.ts` |
| `app/user/onboarding/page.tsx` | wallet check |
| `app/user/history/page.tsx` | receipt list — read `program.account.receipt.all()` filtered by user |
| `app/api/faucet/route.ts` | delete (Circle handles devnet faucet); button now opens https://faucet.circle.com |
| `components/role-entry-redirect.tsx` | `useAccount` → `useWallet` |
| `components/role-guard.tsx` | `useAccount` → `useWallet` |
| `lib/wagmi.ts` | DELETE |
| `lib/contracts.ts` | DELETE (replaced by `lib/solana.ts` + `lib/vista-actions.ts`) |
| `lib/bridge.ts` | port if cross-chain UI needed (uses `vista_bridge` Anchor program) |
| `lib/on-chain-helpers.ts` | rewrite using `program.account.*.fetch` |

## Common port patterns

### Wallet hook

```tsx
// Before (EVM)
import { useAccount } from "wagmi";
const { address } = useAccount();

// After (Solana)
import { useWallet } from "@solana/wallet-adapter-react";
const { publicKey } = useWallet();
const address = publicKey?.toBase58() ?? null;
```

### Read on-chain state

```tsx
// Before (EVM)
const balance = await readContract(wagmiConfig, {
  abi: vistaVaultAbi,
  address: contractAddresses.vistaVault!,
  functionName: "getBalance",
  args: [address],
}) as bigint;

// After (Solana)
import { useVistaProgram } from "@/lib/use-vista-program";
import { fetchUserBalance } from "@/lib/vista-actions";
const program = useVistaProgram();
const balance = program ? await fetchUserBalance(program, publicKey!) : null;
```

### Write on-chain transaction

```tsx
// Before (EVM)
await writeContractAsync({
  abi: vistaEscrowAbi,
  address: contractAddresses.vistaEscrow!,
  functionName: "deposit",
  args: [campaignIdHex, amount, ratePerSecond, BigInt(duration)],
});

// After (Solana)
import { depositCampaign, usdcToBn } from "@/lib/vista-actions";
const sig = await depositCampaign(program, {
  campaignId: campaignIdBytes,        // Uint8Array(32) from bytes32FromSeed
  advertiser: publicKey!,
  totalBudget: usdcToBn(parsedBudget),
  ratePerSecond: usdcToBn(VISTA_RATE),
  duration: new BN(duration),
});
```

### Explorer link

`buildExplorerUrl("tx", sig)` already returns a Solana Explorer URL pointing at devnet.

## Environment variables

Set these in `.env.local`:

```env
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_VISTA_PROTOCOL_PROGRAM_ID=4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM
NEXT_PUBLIC_VISTA_BRIDGE_PROGRAM_ID=9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE
NEXT_PUBLIC_USDC_MINT=2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm
NEXT_PUBLIC_VISTA_FEE_WALLET=<your_protocol_fee_recipient_pubkey>
```

## Auth note

The previous code used **SIWE** (Sign-In with Ethereum) for session auth. The Solana equivalent is **SIWS** (Sign-In with Solana) — sign a message with the wallet and verify server-side with `@solana/web3.js` + `tweetnacl`. For hackathon scope, you can skip auth and just use wallet connection state.

## Install + run

```bash
npm install
npm run dev
```
