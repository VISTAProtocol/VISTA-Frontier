# Vista Frontier — Security Audit (round 1)

**Date:** 2026-05-08
**Scope:** 4 Solana programs (vista_protocol, vista_bridge, oracle_registry, attention_aggregator). Code review only — not formal verification.
**Build status after fixes:** `anchor build` ✅ · `anchor test` ✅ 15/15 passing under Surfpool

---

## Findings — by severity

### 🔴 Critical (fixed)

#### CR-1. Arbitrary slash/credit via unbound `remaining_accounts` in `aggregate_results`

- **Where:** `attention_aggregator/src/lib.rs::aggregate_results`
- **Bug:** Permissionless caller of `aggregate_results` passes `remaining_accounts[i]` as the `OracleNode` for `submissions[i].oracle`, but no on-chain check tied the two together. The `oracle_registry::SlashOrCredit` accounts struct validates `seeds = [b"oracle_node", oracle_node.oracle.as_ref()]` — but that field is read from the account itself (tautological — proves the account is *some* OracleNode, not *the right* one).
- **Impact:** Any caller could route slashing to innocent oracles or credit to attacker-owned oracles. Funds at risk: full `validator_pool_vault` per session × all sessions, plus accumulated stake of victim oracles.
- **Fix:** added explicit binding check before each CPI:
  ```rust
  for i in 0..count {
      let (expected, _bump) = Pubkey::find_program_address(
          &[b"oracle_node", session.submissions[i].oracle.as_ref()],
          &cfg.oracle_registry,
      );
      require_keys_eq!(
          ctx.remaining_accounts[i].key(),
          expected,
          AggregatorError::OracleNodeBindingMismatch
      );
  }
  ```
- **Cost:** ~16 × find_program_address (~24k CU max for full session). Acceptable.

### 🟡 High (fixed)

#### HI-1. `submit_verification` accepted any OracleNode owned by oracle_registry

- **Where:** `attention_aggregator/src/lib.rs::SubmitVerification` accounts struct
- **Bug:** Original constraint was `oracle_node.owner == &config.oracle_registry`. A signer could pass *any* OracleNode (someone else's) and submission would be accepted under the signer's pubkey. Compounded with CR-1 to enable rerouting attacks.
- **Fix:** `seeds::program` binding pins the OracleNode to the canonical PDA derived from `oracle.key()` under `config.oracle_registry`:
  ```rust
  #[account(
      seeds = [b"oracle_node", oracle.key().as_ref()],
      seeds::program = config.oracle_registry,
      bump,
      constraint = oracle_node.owner == &config.oracle_registry @ ...,
  )]
  pub oracle_node: UncheckedAccount<'info>,
  ```

#### HI-2. Slashed-to-zero oracle could keep submitting

- **Where:** `attention_aggregator/src/lib.rs::submit_verification`
- **Bug:** No `active` or `min_stake` check at submission time. An oracle slashed to below-minimum stake could continue voting and dilute consensus.
- **Fix:** added defense-in-depth checks reading `active` flag + `stake` from OracleNode bytes, comparing `stake >= registry.min_stake`:
  ```rust
  let (stake, active) = read_oracle_node_stake_active(&ctx.accounts.oracle_node)?;
  require!(active, AggregatorError::OracleNotActive);
  let min_stake = read_registry_min_stake(&ctx.accounts.registry)?;
  require!(stake >= min_stake, AggregatorError::InsufficientStake);
  ```
- New error variants: `OracleNotActive`, `InsufficientStake`, `RegistryMalformed`.
- New required account in `SubmitVerification`: `registry` (bound via `seeds::program`).

### 🟠 Medium (fixed)

#### ME-1. Stranded validator pool (no escape hatch)

- **Where:** previously no instruction existed
- **Bug:** If a session never reaches aggregator settlement (quorum miss, no permissionless caller), the per-session `validator_pool_vault` USDC is stranded forever. Advertiser had no recourse.
- **Fix:** added `vista_protocol::refund_stuck_validator_pool` (permissionless trigger after 7-day grace from `session.started_at`). Returns balance directly to `campaign.advertiser`'s USDC ATA. Verifies `advertiser_token.owner == campaign.advertiser` so attacker can't redirect.
- New constant: `STUCK_POOL_GRACE_SECONDS = 7 * 24 * 60 * 60`.
- New error: `GracePeriodActive`.
- New event: `StuckValidatorPoolRefunded`.

### 🟢 Documented (intentional hackathon scope)

#### IN-1. Bridge trusted-relayer mode

- **Where:** `vista_bridge::receive_campaign_metadata`, gated by `lz_executor_authority` signer (= oracle-node admin key).
- **Decision:** intentional for hackathon. README §"Hackathon Trust Assumptions" documents this and the production migration path (swap for canonical LayerZero V2 executor PDA). CCTP-side USDC delivery is independently trustless.

#### IN-2. `min_quorum >= 2` floor

- **Where:** `attention_aggregator::initialize`
- **Decision:** keep low floor for demo flexibility; README warns that mainnet should set `min_quorum = 5–7` and raise `min_stake` so cost of 16 sybil oracles exceeds per-campaign MEV.

---

## Findings deferred to a follow-up audit (not patched today)

### LO-1. Reading state via raw byte offsets

- `read_oracle_node_stake_active` and `read_registry_min_stake` walk OracleNode/Registry byte layouts manually. If those structs grow new fields, helpers silently break.
- **Recommendation:** extract a `vista-onchain-types` crate shared between programs so types are deserialized via Anchor's `try_deserialize` rather than byte arithmetic.

### LO-2. `read_token_amount` does the same byte-walking for SPL TokenAccount

- Lower risk because SPL Token Account layout is stable, but same hygiene concern.

### LO-3. Outlier classification of all-zero sessions

- If all oracles report 0, no one is marked outlier (consensus = 0). Correct.
- If a majority reports 0 and minority reports non-zero, the minority is slashed. This is the inherent 51% attack vector — not a bug, but should be documented.

### LO-4. `aggregate_results` compute budget

- For 16 submissions: 16 × `find_program_address` + 16 outlier slashes + 16 honest credits ≈ 100k CU plus CPIs. May approach Solana's 1.4M CU limit if combined with large slashes. Recommend benchmark.

---

## What was tested (Surfpool, 15 cases)

- `oracle_registry` (7): initialize, register_oracle stake gate, slash via aggregator signer PDA, credit_reward + claim, unregister flip, withdraw lockup.
- `vista_protocol` (6): initialize, deposit_campaign, start_stream oracle gate, tick_stream 30/50/10/10 split, end_stream + receipt, withdraw.
- `attention_aggregator` (2): initialize, submit_verification rejects bogus OracleNode + registry.

**Not yet tested (gaps):**
- Full aggregator E2E with real OracleNode binding (CR-1 fix exercised).
- Bridge happy path + grace-period refund.
- `refund_stuck_validator_pool` after 7-day clock advance.
- Cross-program CPI integration (covered partially by `scripts/devnet-e2e.ts`).

---

## Recommendations for Phase 3 (mainnet)

1. **Formal verification** of conservation invariant (sum of payouts ≤ campaign total_budget) using `qedgen` or similar.
2. **Fuzz test** `aggregate_results` with adversarial submission distributions (Trident).
3. **Mainnet config**: `min_quorum >= 5`, `min_stake >= ?` (sized against MEV).
4. **Real LayerZero V2** executor PDA in `vista_bridge`.
5. **Shared types crate** for cross-program byte-reading helpers (LO-1).
