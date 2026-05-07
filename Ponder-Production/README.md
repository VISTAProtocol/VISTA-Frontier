# VISTA Ponder Indexer

Listens to VISTA Protocol smart contract events on Base Sepolia and forwards every event as a POST to the Dashboard API.

Ponder is the single source of truth for all on-chain data. It does **not** store anything — it only forwards.

---

## Setup

### 1. Copy ABIs from the Foundry build

```bash
cd ../vista-contracts
forge build

cp out/VistaStream.sol/VistaStream.json  ../ponder-indexer/abis/VistaStream.json
cp out/VistaEscrow.sol/VistaEscrow.json  ../ponder-indexer/abis/VistaEscrow.json
cp out/VistaVault.sol/VistaVault.json    ../ponder-indexer/abis/VistaVault.json
cp out/VistaReceipt.sol/VistaReceipt.json ../ponder-indexer/abis/VistaReceipt.json
```

The ABI files in this repo already contain **only the `abi` array** (not the full Foundry artifact). If you re-copy from Foundry output you will get the full artifact; Ponder accepts both formats.

### 2. Fill in `.env`

```bash
cp .env.example .env
```

| Variable                | How to get it                                                   |
| ----------------------- | --------------------------------------------------------------- |
| `PONDER_RPC_URL_84532`  | Pre-filled: Base Sepolia public RPC endpoint                    |
| `DASHBOARD_API_URL`     | URL of the Dashboard API service (e.g. `http://localhost:3031`) |
| `DASHBOARD_API_SECRET`  | Must match the Dashboard API's `DASHBOARD_API_SECRET` env var   |
| `VISTA_STREAM_ADDRESS`  | From `vista-contracts/deployments.json` after deploying         |
| `VISTA_ESCROW_ADDRESS`  | From `vista-contracts/deployments.json`                         |
| `VISTA_VAULT_ADDRESS`   | From `vista-contracts/deployments.json`                         |
| `VISTA_RECEIPT_ADDRESS` | From `vista-contracts/deployments.json`                         |
| `START_BLOCK`           | Block number of the deployment transaction (see below)          |
| `VISTA_CHAIN`           | Chain slug (e.g. base-sepolia) for receipts payload             |
| `VISTA_CHAIN_ID`        | Chain id (e.g. 84532) for receipts payload                      |
| `VISTA_PLATFORM`        | Publisher platform label (optional)                             |

### 3. Find START_BLOCK

1. Run the deployment script: `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast`
2. Note the transaction hash from the output
3. Look it up on [Base Sepolia Explorer](https://sepolia.basescan.org)
4. Use the **block number** of that transaction as `START_BLOCK`

This prevents Ponder from scanning the entire chain history from block 0.

### 4. Install and run

```bash
pnpm install
pnpm dev       # hot-reload development mode
# or
pnpm start     # production mode
```

### Railway deployment note

- Production start command already sets a default schema: `ponder start --schema public`.
- If you want a custom schema, set `DATABASE_SCHEMA` in Railway and change the start command accordingly.

---

## What each handler does

### `src/VistaStream.ts`

| Event           | What happened                                                        | POST endpoint       |
| --------------- | -------------------------------------------------------------------- | ------------------- |
| `StreamStarted` | Oracle started a new attention session — user is watching an ad      | `/api/sessions`     |
| `StreamTick`    | Oracle verified 10 more seconds of attention and transferred payment | `/api/ticks`        |
| `StreamEnded`   | Oracle finalized the session — no more ticks will be sent            | `/api/sessions/end` |

### `src/VistaEscrow.ts`

| Event             | What happened                                                | POST endpoint            |
| ----------------- | ------------------------------------------------------------ | ------------------------ |
| `CampaignCreated` | Advertiser deposited USDC and registered a campaign on-chain | `/api/campaigns/confirm` |
| `CampaignEnded`   | Advertiser called for a refund of unspent campaign budget    | `/api/campaigns/end`     |

### `src/VistaVault.ts`

| Event       | What happened                                                         | POST endpoint         |
| ----------- | --------------------------------------------------------------------- | --------------------- |
| `Credited`  | VistaStream deposited earnings into a user or publisher vault balance | `/api/vault/credit`   |
| `Withdrawn` | A user or publisher withdrew their earnings from the vault            | `/api/vault/withdraw` |

### `src/VistaReceipt.ts`

| Event           | What happened                                                        | POST endpoint   |
| --------------- | -------------------------------------------------------------------- | --------------- |
| `ReceiptMinted` | A soulbound NFT receipt was minted to the user after a session ended | `/api/receipts` |

---

## Error handling

- A failed POST to the Dashboard API logs an error and continues — it never crashes the indexer.
- If Ponder itself restarts, it automatically resumes indexing from the last processed block.
- Transport uses HTTP polling (not WebSocket) for Base Sepolia compatibility.
