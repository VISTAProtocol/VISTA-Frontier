# Vista Solana Programs

Anchor workspace containing the on-chain logic for the Vista Protocol.

## Programs

| Program | Path | Role |
|---|---|---|
| `vista_protocol` | [programs/vista_protocol](programs/vista_protocol) | Core protocol — campaign escrow, oracle-driven streaming settlement, vault, and soulbound receipts. Direct Solana flow. |
| `vista_bridge` | [programs/vista_bridge](programs/vista_bridge) | LayerZero V2 receiver — mints Vista SPL rewards on cross-chain message delivery. |

Both programs run side-by-side: users transact directly on Solana via `vista_protocol`, while `vista_bridge` handles cross-chain claims from EVM origins.

## `vista_protocol` — instructions

| Instruction | Caller | Purpose |
|---|---|---|
| `initialize(oracle, vista_wallet)` | admin | One-time setup: writes Config PDA, opens the global `user_vault` USDC token account, and the receipt counter. |
| `set_oracle(oracle)` | admin | Rotate authorized oracle signer. |
| `set_vista_wallet(vista_wallet)` | admin | Update protocol fee recipient. |
| `deposit_campaign(campaign_id, amount, rate_per_second, duration)` | advertiser | Lock USDC into a per-campaign vault PDA. |
| `refund_campaign()` | advertiser | Pull remaining campaign budget back; ends the campaign. |
| `start_stream(session_id, campaign_id)` | oracle | Open a new attention session bound to a (user, publisher, campaign). |
| `tick_stream(seconds_elapsed)` | oracle | Settle verified attention seconds: 40% user / 50% publisher / ~10% protocol. Tokens move on-chain; per-wallet balances accrue in `UserBalance` PDAs. |
| `end_stream()` | oracle | Close the session and mint a soulbound `Receipt` PDA to the viewer. |
| `withdraw()` | user / publisher | Pull accumulated USDC balance to caller's ATA. |

### Account layout

| PDA seeds | Stores |
|---|---|
| `["config"]` | global `Config` (admin, USDC mint, oracle, vista_wallet, vault_authority_bump) |
| `["vault_authority"]` | PDA-only; signs withdrawals from `user_vault` |
| `["user_vault"]` | global SPL token account holding all user + publisher earnings |
| `["receipt_counter"]` | monotonic `u64` token id source |
| `["campaign", campaign_id]` | per-campaign `Campaign` state |
| `["campaign_vault_authority", campaign_id]` | signs payouts from campaign vault |
| `["campaign_vault", campaign_id]` | per-campaign SPL token account |
| `["session", session_id]` | per-session `Session` state |
| `["balance", wallet]` | per-wallet `UserBalance` (user or publisher) |
| `["receipt", token_id_le_bytes]` | per-receipt soulbound `Receipt` |

## Settlement token

Vista uses **Circle's official test USDC on Solana devnet**. The mint address is hardcoded in `vista_protocol`:

```
USDC_MINT = 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

`initialize` rejects any other mint via the `WrongMint` constraint, so the program is locked to USDC by design. To migrate to mainnet, swap the constant in [`programs/vista_protocol/src/lib.rs`](programs/vista_protocol/src/lib.rs) for the real USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) and rebuild.

### Getting test USDC

Use Circle's faucet — it deposits straight into your Solana wallet on devnet:

1. Visit [https://faucet.circle.com](https://faucet.circle.com)
2. Network: **Solana**, Cluster: **devnet**, Token: **USDC**
3. Paste your wallet address, request

You'll need devnet SOL for transaction fees too: `solana airdrop 2 --url devnet`.

## EVM → Solana migration notes

The Solidity protocol used four contracts (`VistaEscrow`, `VistaStream`, `VistaVault`, `VistaReceipt`) plus `MockUSDC`. They are collapsed into a single Anchor program because Solana has no contract-size limit and inter-contract `onlyAuthorizedX` patterns become signer key checks instead.

Concrete mappings:

- ERC-20 `MockUSDC` → Circle's devnet USDC mint (no Rust port needed; SPL Token Program handles transfer/approve/etc).
- `bytes32 campaignId` / `sessionId` → `[u8; 32]` (still derived off-chain by the Oracle).
- ERC-1155 soulbound receipt → `Receipt` PDA. PDAs cannot be transferred between owners, so soulbound semantics are intrinsic. To upgrade to a real NFT, swap the PDA for a Metaplex Core asset with the non-transferable extension.
- Solidity events → Anchor `#[event]` (emitted via `emit!`); the indexer reads program logs.
- `OnlyAuthorizedStream` modifier → not needed: in the EVM design, `VistaStream` was a separate contract calling `VistaVault.credit`; here the same code path lives inside `vista_protocol` so the oracle signer check on `tick_stream` is sufficient.
- `ReentrancyGuard` → unnecessary; Solana serializes account access per transaction.
- `block.timestamp` → `Clock::get()?.unix_timestamp`.

## Build / deploy

```bash
# from Solana-Program/
anchor build
anchor keys sync          # writes real program IDs into Anchor.toml + lib.rs
solana config set --url devnet
solana airdrop 2          # SOL for deploy fees
anchor deploy             # provider already set to devnet in Anchor.toml
```

After first deploy, set up one-time state (admin signs):

```bash
# scripts/initialize.ts is provided — reads env, derives PDAs, calls initialize()
ORACLE_PUBKEY=<oracle_pk> \
VISTA_WALLET_PUBKEY=<fee_recipient_pk> \
npm run init
```

The script is idempotent: if the Config PDA already exists, it exits cleanly. Use `set_oracle` / `set_vista_wallet` instructions to update later.

Defaults (override via env):

| Env | Default |
|---|---|
| `ANCHOR_PROVIDER_URL` | `https://api.devnet.solana.com` |
| `ANCHOR_WALLET` | `~/.config/solana/id.json` |
| `USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle devnet USDC) |
| `VISTA_PROTOCOL_PROGRAM_ID` | synced devnet program id |
| `ORACLE_PUBKEY` | **required** |
| `VISTA_WALLET_PUBKEY` | **required** |

## Next steps

- Run `anchor keys sync` after first build to replace placeholder program IDs (`VistaProto1...`, `VistaBridge1...`).
- Wire `vista_bridge` to call into `vista_protocol` (or vice versa) so cross-chain claims credit `UserBalance` directly, instead of minting a separate Vista token.
- Add a Metaplex Core asset on `end_stream` if a real NFT (rather than a PDA-only receipt) is required.
- Tests with [LiteSVM](https://github.com/LiteSVM/litesvm) or `anchor test`.
