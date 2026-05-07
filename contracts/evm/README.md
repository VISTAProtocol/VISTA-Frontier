# VistaGateway — EVM cross-chain deposit gateway

`VistaGateway.sol` is deployed on each supported EVM chain (Base Sepolia and
Arbitrum Sepolia for the hackathon). Advertisers call `depositCampaign`,
which:

1. Pulls USDC from the advertiser via `transferFrom`.
2. Burns it via Circle CCTP (`depositForBurn`) for native mint on Solana.
   The `mintRecipient` is the per-campaign vault PDA on `vista_bridge`.
3. Ships campaign metadata (campaignId, advertiser, budget, rate, duration,
   CCTP nonce) to `vista_bridge` via LayerZero V2.

The Solana-side `vista_bridge` program receives the metadata, waits for CCTP
to mint the USDC into the vault PDA, and then activates the campaign. From
that point on, the campaign behaves identically to a Solana-native one.

## Setup

```bash
cd contracts/evm
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install deps
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install LayerZero-Labs/devtools
forge install LayerZero-Labs/layerzero-v2
```

## Build & test

```bash
cp .env.example .env  # fill in deployer key + RPCs
forge build
forge test
```

## Deploy

For each chain, source the env and run the script:

```bash
# Base Sepolia
source .env  # ensure LZ_ENDPOINT, CCTP_TOKEN_MESSENGER, USDC are set per .env.example
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify

# Arbitrum Sepolia
forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast --verify
```

After deployment, copy the `VistaGateway` address into:
- `Super-Dashboard/.env` as `NEXT_PUBLIC_VISTA_GATEWAY_BASE_SEPOLIA` /
  `NEXT_PUBLIC_VISTA_GATEWAY_ARB_SEPOLIA`
- `oracle-node/.env` as `VISTA_GATEWAY_BASE_SEPOLIA` / `VISTA_GATEWAY_ARB_SEPOLIA`

Then run `setPeer(uint32 eid, bytes32 peer)` against your deployed gateways
to wire the `vista_bridge` program ID as the LayerZero peer on Solana
(left-padded `bytes32` of the program's pubkey). For the hackathon
trusted-relayer mode this is informational only — actual delivery is
performed by `oracle-node`'s `evmWatcher`.
