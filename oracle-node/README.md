# vista-oracle-node

Stakeable oracle node for the **VISTA Trustless Attention Market**.

Anyone can run this service against devnet (or mainnet, eventually), stake 100 USDC into the on-chain `oracle_registry`, and start verifying human attention. Honest validators split 10% of every ad dollar; outlier scores get their stake slashed.

---

## How it fits

```
SDK → POST /heartbeat ──► oracle-node ─► attention_aggregator.submit_verification ─► AttentionSession PDA
                                │
                                └─► POST /api/oracle/sync (Super-Dashboard)
```

A single oracle session window is 10s. After the window closes (or quorum reached), anyone can call `attention_aggregator::aggregate_results`, which:

1. CPIs `oracle_registry::slash_oracle` for outliers (10% of stake).
2. CPIs `vista_protocol::drain_validator_pool` to drain that session's USDC pool into the registry's `RewardVault`.
3. CPIs `oracle_registry::credit_reward` for each honest oracle.

Operators then call `oracle_registry::claim_rewards` to pull their accrued USDC.

---

## Local setup

```bash
cd oracle-node
cp .env.example .env
# 1. point ORACLE_KEYPAIR_PATH at your Solana keypair
# 2. set ORACLE_WEBHOOK_SECRET to match Super-Dashboard's value
solana-keygen new -o ./keypair.json --no-bip39-passphrase --silent
# Fund the keypair with devnet USDC:
#   - faucet SOL: solana airdrop 2 <pubkey> --url devnet
#   - faucet USDC: https://faucet.circle.com (Solana devnet)

npm install
npm run dev
```

Once registered on-chain (`oracle_registry::register_oracle`), the node logs `active. stake=… reward=…`. Heartbeats arrive at `POST /heartbeat`; scores are buffered per session and flushed every 10s as a single on-chain `submit_verification` call.

---

## Multi-node demo deploy (Railway)

```
oracle-node-1: PORT=4001  ORACLE_KEYPAIR_PATH=/keys/keypair_1.json
oracle-node-2: PORT=4002  ORACLE_KEYPAIR_PATH=/keys/keypair_2.json
oracle-node-3: PORT=4003  ORACLE_KEYPAIR_PATH=/keys/keypair_3.json
```

All three use the same image, different keypairs. All three register on devnet. The SDK fans heartbeats out to all three (or, until the SDK supports multi-broadcast, you can drive the dashboard's `/api/oracle/active-nodes` and route from there).

`railway up` from this directory uses the included `Dockerfile` and `railway.json`.

---

## Signal coverage

The verifier in `src/verifier.ts` follows the full spec rubric (max 100 pts):

| Signal                        | Weight | Source                                   |
| ----------------------------- | -----: | ---------------------------------------- |
| `visibility ≥ 0.5`            |     25 | SDK `IntersectionObserver`               |
| `tabFocused`                  |     20 | SDK `document.visibilityState`           |
| `mouseActive`                 |     10 | SDK mousemove debounce                   |
| `scrolled`                    |      5 | SDK scroll debounce                      |
| `pointerVelocityVariance>0.3` |     15 | SDK coefficient-of-variation (window 20) |
| `mediaProgress > 0.8`         |     15 | SDK `<video>.currentTime / duration`     |
| `idleState === "active"`      |      5 | SDK `IdleDetector` API (Chromium)        |
| `clickRhythmVariance > 0.2`   |      5 | SDK CV of click intervals (window 10)    |

SDK v0.2 emits all eight signals out of the box. `IdleDetector` requires user permission and is Chromium-only; on other browsers `idleState` falls back to `"active"`, costing 5 pts max. `mediaProgress` requires a `<video>` inside the attached zone (or a `videoElementId` in `VistaConfig`).

---

## On-chain auth model

- Heartbeats are **not** signed by the SDK. They are best-effort observations; the source of truth is the multi-oracle aggregation.
- Oracle authorization is **on-chain only**. The node calls `fetchSelf()` at boot and every `selfCheckSeconds` (default 60s) to confirm its `OracleNode.active == true`. If not, it rejects every `/heartbeat` with 503 and skips flushes.
- The `aggregator_signer` PDA owned by `attention_aggregator` is the **only** account allowed to invoke `slash_oracle` / `credit_reward` / `drain_validator_pool` — verified with `require_keys_eq!` against `Pubkey::find_program_address(&[b"aggregator_signer"], …)` in each callee program.

---

## Risks

- **Webhook ordering**: `/api/oracle/sync` is best-effort. If the node crashes between an on-chain tx and the webhook POST, the dashboard drifts. A reconciliation cron is a follow-up.
- **Slashed-stake sink**: v1 leaves slashed USDC in `StakeVault`. Decide later whether to redistribute, burn, or sweep to `vista_wallet`.
- **Outlier detection on small N**: with `min_quorum=3`, mean-based detection can be skewed. Consider trimmed-mean before mainnet.
