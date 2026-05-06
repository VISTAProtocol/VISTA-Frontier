# VISTA Oracle Server

Receives attention heartbeats from the browser SDK and triggers smart contract payments on Base Sepolia. Calls `VistaStream.startStream`, `tickStream`, and `endStream` on the oracle wallet's behalf.

## Setup

**1. Deploy contracts and copy deployments.json**

```bash
cd ../vista-contracts
forge script script/Deploy.s.sol --broadcast --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
cp deployments.json ../oracle-server/deployments.json
```

**2. Install dependencies**

```bash
cd oracle-server
npm install
```

**3. Configure environment**

```bash
cp .env.example .env
# Fill in:
#   ORACLE_PRIVATE_KEY  — private key of wallet set as authorizedOracle in VistaStream
#   BASE_RPC_URL       — Base Sepolia RPC endpoint
#   ORACLE_SECRET       — shared secret for SDK authentication
```

**4. Register oracle wallet on-chain** (if deployer != oracle wallet)

```bash
cast send $VISTA_STREAM_ADDRESS "setAuthorizedOracle(address)" $ORACLE_WALLET \
  --rpc-url $BASE_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
```

## Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

## API

### POST /heartbeat

Called by the SDK every second while the user watches an ad.

```bash
curl -X POST http://localhost:3001/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc-123",
    "apiKey": "your-secret-key",
    "userWallet": "0xUserWalletAddress",
    "campaignId": "campaign-xyz",
    "publisherWallet": "0xPublisherWalletAddress",
    "timestamp": 1714000000000,
    "nonce": "unique-nonce-001",
    "score": 0.9,
    "signals": {
      "visibility": 0.8,
      "tabFocused": true,
      "mouseActive": true,
      "scrolled": false
    }
  }'
```

Response:

```json
{
  "valid": true,
  "score": 0.9,
  "validSeconds": 7,
  "pendingSeconds": 7,
  "flagged": false
}
```

### POST /session/end

Called by the SDK when the user leaves (tab close, navigation).

```bash
curl -X POST http://localhost:3001/session/end \
  -H "Content-Type: application/json" \
  -d '{ "sessionId": "session-abc-123", "apiKey": "your-secret-key" }'
```

Response:

```json
{ "success": true, "totalSeconds": 47 }
```

## Payment Flow

1. First valid heartbeat → `startStream(sessionId, campaignId, userWallet, publisherWallet)` on-chain
2. Every 10 valid seconds → `tickStream(sessionId, 10)` releases payment (50% user, 40% publisher, 10% VISTA)
3. Session end or 15s timeout → `endStream(sessionId)` mints soulbound receipt NFT

## Bot Detection

Three checks run on every heartbeat:

- **Score variance** < 0.001 over 10 samples → flagged
- **Perfect score streak** (all 10 > 0.95) → flagged
- **Interval regularity** variance < 10ms over 10 samples → flagged

Flagged sessions receive a 0.5× payment multiplier applied silently.
