# Vista Frontier — Solana Tech Stack Audit

**Audit date:** 2026-05-08
**Migration applied:** 2026-05-08 (same day) — all P0/P1 dependency findings resolved, `anchor build` green
**Scope:** all `Cargo.toml` and `package.json` manifests across the monorepo
**Focus:** Solana / Anchor / SPL / wallet-adapter version freshness + compatibility matrix

> **Status (final, 2026-05-08):** F1, F2, F3, F4, F5, F6, F7, F9, F10 ✅ all resolved. F8 ❌ withdrawn (false positive). `anchor build` ✅ + `Super-Dashboard` Next 16 webpack build ✅. See `.superstack/build-context.md` for full migration log.

---

## 1. Local toolchain (installed on this machine)

| Tool | Installed | Latest stable | Status |
|---|---|---|---|
| `rustc` | 1.94.1 | 1.94.x | OK |
| `solana-cli` (Agave) | **3.1.12** | 3.1.x | OK (Solana 3.x line) |
| `anchor-cli` | **0.32.1** | **1.0.2** | **STALE** — major version behind |
| `node` | 24.10.0 | 24.x LTS | OK |

**Critical mismatch:** the local Solana CLI is on the **3.x (Agave) line**, but the workspace pins **Anchor 0.32.1**. Per the official Anchor 1.0 release notes:

> *"Anchor `1.0.0` targets Solana `3.x`."*

Anchor 0.32 was paired with Solana 2.x. Building 0.32 programs against Agave 3.1 can work but is unsupported and triggers IDL-build edge-cases. Either downgrade Solana to 2.x or — recommended — upgrade Anchor to 1.0.

---

## 2. Rust workspace — `Solana-Program/`

`Anchor.toml` declares `anchor_version = "0.32.1"`. All four programs declare:

```toml
anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }
anchor-spl  = "0.32.1"            # not in attention_aggregator
```

Resolved transitively in `Cargo.lock`:

| Crate | Locked | Latest on crates.io | Status |
|---|---|---|---|
| `anchor-lang` | 0.32.1 | **1.0.2** (May 2026) | **MAJOR behind** |
| `anchor-spl` | 0.32.1 | **1.0.2** | **MAJOR behind** |
| `solana-program` | 2.3.0 | **4.0.0** (Feb 2026) | **2 majors behind** (transitive — pulled by anchor) |
| `spl-token` | 8.0.0 | 8.x | OK |
| `spl-associated-token-account` | 7.0.0 | 7.x | OK |
| `borsh` | 0.10.4 + 1.6.1 | 1.6.x | OK (anchor still pulls 0.10) |

**Workspace Cargo.toml:** no version overrides, no `[workspace.dependencies]` table — every program redeclares the same line. Recommend hoisting to `[workspace.dependencies]` for single-source-of-truth bumps.

---

## 3. JS / TS dependencies

### `Solana-Program/package.json` (Anchor test harness)

| Package | Declared | Latest | Status |
|---|---|---|---|
| `@coral-xyz/anchor` | ^0.32.1 | 0.32.1 | OK (latest of 0.x line) — note: Anchor 1.0 renames this to `@anchor-lang/core` |
| `@solana/spl-token` | ^0.4.9 | **0.4.14** | minor behind |
| `@solana/web3.js` | ^1.95.4 | **1.98.4** | minor behind |

### `oracle-node/package.json`

| Package | Declared | Latest | Status |
|---|---|---|---|
| `@coral-xyz/anchor` | ^0.32.1 | 0.32.1 | OK |
| `@solana/spl-token` | ^0.4.9 | **0.4.14** | minor behind |
| `@solana/web3.js` | ^1.95.4 | **1.98.4** | minor behind |
| `viem` | ^2.48.8 | 2.x | OK (EVM relayer) |
| `zod` | ^3.23.8 | 3.x | OK |

### `Super-Dashboard/package.json` (Next 14)

| Package | Declared | Latest | Status |
|---|---|---|---|
| `@coral-xyz/anchor` | ^0.32.1 | 0.32.1 | OK |
| `@solana/web3.js` | ^1.95.4 | **1.98.4** | minor behind |
| `@solana/spl-token` | ^0.4.9 | **0.4.14** | minor behind |
| `@solana/wallet-adapter-base` | ^0.9.23 | **0.9.27** | minor behind |
| `@solana/wallet-adapter-react` | ^0.15.35 | **0.15.39** | minor behind |
| `@solana/wallet-adapter-react-ui` | ^0.9.35 | **0.9.39** | minor behind |
| `@solana/wallet-adapter-wallets` | ^0.19.32 | **0.19.38** | minor behind |
| `next` | 14.2.35 | **16.2.6** | **2 majors behind** |
| `react` / `react-dom` | ^18 | **19.2.6** | 1 major behind |

### `Mock-Farcaster/package.json` (Next 16)

| Package | Declared | Latest | Status |
|---|---|---|---|
| `@coral-xyz/anchor` | ^0.32.1 | 0.32.1 | OK |
| `@solana/web3.js` | ^1.95.4 | **1.98.4** | minor behind |
| `@solana/wallet-adapter-*` | (same as above) | — | minor behind |
| `next` | 16.2.4 | 16.2.6 | OK |
| `react` / `react-dom` | 19.2.4 | 19.2.6 | OK |

> Mock-Farcaster's `AGENTS.md` warns Next 16 has breaking-from-training-data APIs — confirmed: only this app is on Next 16; Super-Dashboard is two majors behind.

---

## 4. Compatibility matrix (recommended target)

This is the configuration that yields a fully-aligned, latest-stable Solana stack:

| Layer | Recommended pin | Why |
|---|---|---|
| Rust toolchain | 1.94.x | matches Anchor 1.0 MSRV |
| `solana-cli` (Agave) | **3.1.x** | already installed; Anchor 1.0's required floor |
| `anchor-cli` | **1.0.2** | latest; AVM-installed |
| `anchor-lang`, `anchor-spl` | **1.0.2** | matches CLI |
| `solana-program` (if direct) | 4.0.x | latest; Anchor 1.0 brings this in transitively |
| `spl-token` (Rust) | 8.x | OK |
| `@anchor-lang/core` *(new name)* | **1.0.2** | replaces `@coral-xyz/anchor` in Anchor 1.0 |
| `@solana/web3.js` | **1.98.4** | latest of legacy 1.x line |
| `@solana/spl-token` | **0.4.14** | latest |
| `@solana/wallet-adapter-base` | 0.9.27 | latest |
| `@solana/wallet-adapter-react` | 0.15.39 | latest |
| `@solana/wallet-adapter-react-ui` | 0.9.39 | latest |
| `@solana/wallet-adapter-wallets` | 0.19.38 | latest |
| Surfpool *(new dependency)* | ≥1.1.2 | required by `anchor test` in 1.0 |
| Next.js | 16.2.6 (both apps) | unify across monorepo |
| React | 19.2.x | required by Next 16 |

---

## 5. Findings — by severity

### P0 — must address before mainnet

- **F1. Anchor major-version lag.** `anchor_version = "0.32.1"` in `Anchor.toml` and all four program `Cargo.toml` files. Anchor 1.0 is the current line and is the version that targets Solana 3.x (your installed CLI). Staying on 0.32 against Solana 3.1 is unsupported.
  *Fix:* upgrade per §6 below. Plan ~½ day for breaking changes (CpiContext, duplicate-mutable accounts, IDL build, `[registry]` removal in Anchor.toml).

- **F2. Solana-CLI ↔ Anchor mismatch in CI.** Anyone cloning today gets `solana-cli 3.x` (current default install) but `anchor 0.32.1` from `Anchor.toml`'s `[toolchain]`. Builds will succeed inconsistently. *Fix:* either lock `solana_version = "2.x"` in `[toolchain]` (temporary) or migrate to Anchor 1.0 (permanent).

### P1 — fix before mainnet

- **F3. `@coral-xyz/anchor` will be renamed.** Once you upgrade to Anchor 1.0, every TS import flips to `@anchor-lang/core`. Affects: `Solana-Program/`, `oracle-node/`, `Super-Dashboard/`, `Mock-Farcaster/`. *Fix:* coordinated rename in one PR.

- **F4. `init-if-needed` feature flag.** Enabled in every program. Anchor docs continue to discourage this — it requires you to enforce all `init` invariants manually. Audit each `init_if_needed` site, or remove the feature.

- **F5. No `[workspace.dependencies]` hoisting.** Four `Cargo.toml` files independently restate the same Anchor pin → drift risk. *Fix:*
  ```toml
  # Solana-Program/Cargo.toml
  [workspace.dependencies]
  anchor-lang = { version = "1.0.2", features = ["init-if-needed"] }
  anchor-spl  = "1.0.2"
  ```
  then `anchor-lang.workspace = true` in each program.

### P2 — fix before TVL grows

- **F6. Super-Dashboard stuck on Next 14 + React 18.** Mock-Farcaster already on Next 16 + React 19 → divergent runtime semantics across the monorepo. *Fix:* upgrade Super-Dashboard to match.

- **F7. Wallet-adapter / web3.js / spl-token minor lag.** All ~4 minors behind. Pure SemVer-minor; bundle into a single bump PR.

- ~~**F8. `lucide-react: ^1.8.0` suspicious.**~~ **Withdrawn 2026-05-08** — direct npm-registry check confirms lucide-react has a real 1.x line (latest 1.14.0). `^1.8.0` is fine.

### P3 — best practice

- **F9. No `rust-toolchain.toml`.** Pin the rustc channel so contributors get reproducible builds: `[toolchain] channel = "1.94.1"`.
- **F10. `Anchor.toml` `[registry]` block** will be removed in Anchor 1.0; delete during the upgrade.

---

## 6. Upgrade commands

### Step 1 — Install Anchor 1.0 via AVM (no project changes yet)

```bash
avm install 1.0.2
avm use 1.0.2
anchor --version   # → 1.0.2
```

### Step 2 — Bump Rust deps

In `Solana-Program/Cargo.toml`, add hoisted versions:

```toml
[workspace]
members = ["programs/*"]
resolver = "2"

[workspace.dependencies]
anchor-lang = { version = "1.0.2", features = ["init-if-needed"] }
anchor-spl  = "1.0.2"
```

In each `programs/*/Cargo.toml`:

```toml
[dependencies]
anchor-lang = { workspace = true }
anchor-spl  = { workspace = true }   # omit for attention_aggregator
```

### Step 3 — Bump `Anchor.toml`

```toml
[toolchain]
anchor_version  = "1.0.2"
solana_version  = "3.1.12"     # explicit — was implicit
# delete the [registry] block
```

### Step 4 — Bump JS deps (run in each package)

```bash
# every JS workspace
npm i @solana/web3.js@^1.98.4 @solana/spl-token@^0.4.14

# Super-Dashboard + Mock-Farcaster
npm i @solana/wallet-adapter-base@^0.9.27 \
      @solana/wallet-adapter-react@^0.15.39 \
      @solana/wallet-adapter-react-ui@^0.9.39 \
      @solana/wallet-adapter-wallets@^0.19.38

# AFTER you migrate code from @coral-xyz/anchor → @anchor-lang/core:
npm uninstall @coral-xyz/anchor
npm i @anchor-lang/core@^1.0.2
```

Codemod for the rename:

```bash
grep -rl "@coral-xyz/anchor" --include="*.ts" --include="*.tsx" \
  | xargs sed -i '' 's|@coral-xyz/anchor|@anchor-lang/core|g'
```

### Step 5 — Migrate `anchor test`

Anchor 1.0 defaults to **Surfpool** for `anchor test` and `anchor localnet`. Either install it (`brew install txtx/taps/surfpool`) or pass `--validator legacy` while you transition.

### Step 6 — Rebuild & re-run

```bash
cd Solana-Program && anchor build && anchor test
```

Expect compile errors around: `CpiContext::new` arity, duplicate-mutable account refs, removed `#[interface]` macro. Fix-list is in the [Anchor 1.0 release notes](https://www.anchor-lang.com/docs/updates/release-notes/1-0-0).

---

## 7. Scores

| Dimension | Grade | Comment |
|---|---|---|
| Solana stack freshness | **C** | major-version lag on Anchor + Next 14 stragglers |
| Compatibility alignment | **C-** | Solana CLI 3.x running against Anchor 0.32 is the load-bearing risk |
| Dependency hygiene | **B** | clean manifests, no obviously yanked pkgs except F8; no hoisting |
| **Ready for mainnet?** | **No** | resolve F1–F4 first |

---

## Sources

- [Anchor 1.0 release notes](https://www.anchor-lang.com/docs/updates/release-notes/1-0-0)
- [Anchor releases on GitHub](https://github.com/coral-xyz/anchor/releases)
- [Solana installation guide](https://solana.com/docs/intro/installation)
- crates.io: [`anchor-lang`](https://crates.io/crates/anchor-lang), [`solana-program`](https://crates.io/crates/solana-program)
- npm: `@solana/web3.js`, `@solana/spl-token`, `@solana/wallet-adapter-*`, `@coral-xyz/anchor`, `next`, `react`
