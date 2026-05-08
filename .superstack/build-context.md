# Vista Frontier — Build Context

## Stack snapshot (after full migration, 2026-05-08)

- **Workspace:** `Solana-Program/` (Anchor 1.0.2 — 4 programs), `sdk/`, `oracle-node/`, `Super-Dashboard/` (Next 16 + React 19), `Mock-Farcaster/` (Next 16 + React 19), `contracts/evm/`
- **Programs:** vista_protocol, vista_bridge, oracle_registry, attention_aggregator (devnet IDs unchanged)
- **Toolchain:** rustc 1.94.1 · solana-cli (Agave) 3.1.12 · **anchor-cli 1.0.2** · node 24.10.0 · **surfpool 1.1.2**
- **Build status:** ✅ `anchor build` clean · ✅ `Super-Dashboard` Next 16 webpack build clean

## review

- **dependency_freshness:** A — all on-chain + JS deps at latest stable
- **compatibility_alignment:** A — Anchor 1.0.2 ↔ Solana 3.1.12 ↔ Rust 1.94.1 fully aligned
- **ready_for_mainnet:** false — still pending: security audit (CPI auth, math, reentrancy), Surfpool-based test run

## All findings — final state

| ID | Severity | Status | Notes |
|---|---|---|---|
| F1 | P0 | ✅ resolved | Anchor 0.32.1 → 1.0.2 (workspace + 4 programs); 15 CpiContext sites + 1 Context-lifetime site fixed |
| F2 | P0 | ✅ resolved | `solana_version = "3.1.12"` pinned in `Anchor.toml [toolchain]` |
| F3 | P1 | ✅ resolved | `@coral-xyz/anchor` → `@anchor-lang/core` codemod across 11 TS files + 4 package.json |
| F4 | P1 | ✅ resolved (no code change) | All 5 `init_if_needed` sites use canonical safe pattern: PDA seeds, fixed size, trusted oracle payer, Anchor discriminator gates reinit. Documented in audit. |
| F5 | P1 | ✅ resolved | `[workspace.dependencies]` hoisting; 4 programs use `{ workspace = true }` |
| F6 | P2 | ✅ resolved | Super-Dashboard: Next 14 → 16, React 18 → 19, eslint 8 → 9, async route params codemod (13 routes), `next.config.mjs` cleanup, `lint`/`build` scripts updated, `--webpack` flag set. Build green. |
| F7 | P2 | ✅ resolved | web3.js 1.98.4, spl-token 0.4.14, wallet-adapter-base 0.9.27, wallet-adapter-react 0.15.39, wallet-adapter-react-ui 0.9.39, wallet-adapter-wallets 0.19.38 — all at latest stable, lockfiles synced |
| F8 | (withdrawn) | ❌ false positive | lucide-react 1.x line confirmed real (latest 1.14.0) |
| F9 | P3 | ✅ resolved | `rust-toolchain.toml` created (channel 1.94.1) |
| F10 | P3 | ✅ resolved | `[registry]` block removed from `Anchor.toml` |

## What was changed (full migration log, 2026-05-08)

### Solana / Rust
- `Solana-Program/Cargo.toml` — added `[workspace.dependencies]` hoisting (anchor-lang 1.0.2 + anchor-spl 1.0.2)
- `Solana-Program/programs/*/Cargo.toml` (×4) — switched to workspace inheritance
- `Solana-Program/Anchor.toml` — `anchor_version = 1.0.2`, `solana_version = 3.1.12` pinned, `[registry]` removed
- `rust-toolchain.toml` — created at repo root, channel 1.94.1
- Anchor 1.0 breaking-change fixes:
  - `CpiContext::new(_with_signer)?` first arg `to_account_info()` → `key()` — 15 sites: 7× `vista_protocol`, 5× `vista_bridge`, 3× `oracle_registry`
  - `Context<'_, '_, 'info, 'info, T>` → `Context<'info, T>` — 1 site in `attention_aggregator`

### JavaScript / TypeScript
- TS codemod across 11 files: `@coral-xyz/anchor` → `@anchor-lang/core`
- 4× `package.json` — `@anchor-lang/core@1.0.2` (replaces `@coral-xyz/anchor`), JS deps bumped to latest

### Super-Dashboard (Next 14 → 16)
- `package.json` — `next 16.2.6`, `react 19.2.6`, `react-dom 19.2.6`, `@types/react ^19`, `@types/node ^22`, `eslint ^9`, `eslint-config-next 16.2.6`. Scripts: `lint: "eslint ."` (next lint removed in 16), `build: "next build --webpack"` (custom webpack config preserved).
- `next.config.mjs` — removed `eslint.ignoreDuringBuilds` (option removed in Next 16); `webpack(config)` retained (works under `--webpack`).
- 13 API route handlers codemod: `params: { ... }` → `params: Promise<{ ... }>` + `params.X` → `(await params).X`. False-positive `URLSearchParams` helpers fixed manually in `attention/[wallet]` and `attention/user/[wallet]`.

### Toolchain / system
- `avm install 1.0.2 && avm use 1.0.2` — Anchor CLI now 1.0.2
- `brew install txtx/taps/surfpool` — surfpool 1.1.2 (meets Anchor 1.0 minimum)
- Cleared `~/.npm` cache (reclaimed 13 GB; disk had hit 100%)

## Security audit round 1 (2026-05-08) — see `.superstack/security-audit.md`

**Critical fixed (CR-1):** `attention_aggregator::aggregate_results` now binds `remaining_accounts[i]` to `submissions[i].oracle` via `find_program_address`. Previously a permissionless caller could route slash/credit to wrong oracles.

**High fixed (HI-1, HI-2):** `submit_verification` now uses `seeds::program` to bind oracle_node to signer's PDA, plus reads `active` flag and `stake >= min_stake` from byte layout. New required account: `registry`.

**Medium fixed (ME-1):** `vista_protocol::refund_stuck_validator_pool` — permissionless escape hatch after 7-day grace, refunds stranded validator pool back to campaign advertiser.

**Tests:** 15/15 passing under Surfpool (`cluster = "localnet"` in Anchor.toml).

**Documented as hackathon-scope:**
- Bridge `lz_executor_authority` (single trusted-relayer key) — README §Hackathon Trust Assumptions
- `min_quorum >= 2` floor — same section, with mainnet recommendation 5–7

## Deferred-tasks round (2026-05-08, all 5 closed)

- ✅ **`scripts/devnet-e2e.ts`** — added `registry: registryPda` to `submitVerification` accountsPartial (required by HI-1 fix). Codemod from earlier round was already in place.
- ✅ **`vista_bridge` tests** — new `tests/vista_bridge.ts`, 8 cases: initialize_bridge, lz_executor auth gate, happy-path receive, confirm_usdc_received balance gate (fail + success), start/tick/end cross-chain stream with 30/50/10/10 split assertion.
- ✅ **`refund_stuck_validator_pool` test** — uses Surfpool's `surfnet_timeTravel` cheatcode (`absoluteTimestamp` in **milliseconds**) to warp 7 days forward. 3 cases: grace-period rejection, wrong-ATA rejection post-grace, permissionless refund happy path.
- ✅ **Shared types refactor (LO-1)** — `attention_aggregator/Cargo.toml` now depends on `oracle_registry` with `features = ["cpi"]`. Byte-walking helpers replaced with `OracleNode::try_deserialize` + `Registry::try_deserialize`. `idl-build` propagated to `oracle_registry` so anchor-spl traits resolve. Test count unchanged.
- ✅ **`npm audit` triage** — see `.superstack/npm-audit-triage.md`. **41 → 7 vulns** by switching from `@solana/wallet-adapter-wallets` bundle to direct `@solana/wallet-adapter-phantom` + `@solana/wallet-adapter-solflare` (kills entire Trezor → protobufjs chain). All 6 critical eliminated. Remaining 7 vulns are transitive + upstream-blocked + LOW practical risk; documented.

## Test totals

```
attention_aggregator (smoke)        2/2
oracle_registry                     7/7
vista_bridge                        8/8
vista_protocol + refund_stuck_…     6/6 + 3/3 = 9
TOTAL                              26/26 passing under Surfpool
```

## Still open (not in any current task)

- Compiler `cfg(feature = "anchor-debug")` warnings on every `#[program]`/`#[derive(Accounts)]` — harmless; add `anchor-debug = []` under `[features]` to silence.
- `bigint-buffer 1.1.5` & `axios 1.13.6` vulns — no patched upstream version yet; revisit in 2 weeks.
- Formal verification of conservation invariants — recommend `qedgen` for Phase 3 (see security-audit.md §Recommendations).

## Next phase

Project is now ready for **Phase 3 (Launch)** dependency-wise. Before mainnet:
1. Security audit (consider `qedgen` for invariant proofs on CPI auth + slashing math)
2. Test pass under Surfpool
3. `deploy-to-mainnet` skill for the deploy checklist
