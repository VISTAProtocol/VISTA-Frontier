# Local multi-oracle setup

Two roles run side-by-side:

| Role | Keypair | Port | Env file | What it does |
|---|---|---|---|---|
| Bridge relayer (LZ stub) | `FRTMLy9...43Ke` (= on-chain `lz_executor_authority`) | 4000 | `oracle-node/.env` | Watches EVM `VistaGateway`, submits `receive_campaign_metadata` + `confirm_usdc_received` |
| Attention oracle 1 | `oracle_1.json` | 4001 | `local-oracles/oracle_1.env` | Heartbeats → `submit_verification` / `tick_stream` / `aggregate_results` |
| Attention oracle 2 | `oracle_2.json` | 4002 | `local-oracles/oracle_2.env` | Same as oracle 1 |
| Attention oracle 3 | `oracle_3.json` | 4003 | `local-oracles/oracle_3.env` | Same as oracle 1 |

Only the bridge relayer's keypair is allowed to call `receive_campaign_metadata` (the on-chain program checks `lz_executor_authority`). Attention oracles have their `VISTA_GATEWAY_*` blanked so they never try; the startup guard in `src/index.ts` also fail-fasts any oracle that has cross-chain enabled but the wrong keypair.

To verify which key is the on-chain authority right now:

```bash
cd oracle-node && npx tsx scripts/check-lz-authority.ts
```

## Pubkeys (for dashboard registration)

After fresh-generation, oracles are at:
- `oracle_1` → port 4001 → endpoint `http://localhost:4001`
- `oracle_2` → port 4002 → endpoint `http://localhost:4002`
- `oracle_3` → port 4003 → endpoint `http://localhost:4003`

Pubkeys are written to `oracle_<N>.json` — read with:
```bash
solana-keygen pubkey local-oracles/oracle_1.json
```

## Run a single oracle

From the `oracle-node/` directory:

```bash
# Load env from local-oracles/oracle_1.env then run
set -a && source local-oracles/oracle_1.env && set +a && npm run dev
```

Or one-liner with env-cmd if installed:
```bash
npx env-cmd -f local-oracles/oracle_1.env npm run dev
```

> Don't use `export $(grep -v '^#' file | xargs)` — `ORACLE_KEYPAIR_JSON` is a JSON
> array containing commas/brackets that xargs word-splits, corrupting the value.
> `set -a; source` preserves the literal value.

## Run all 4 in parallel

Open 4 terminals. In each:

```bash
# Terminal 1 — bridge relayer (port 4000)
cd oracle-node
set -a && source .env && set +a
npm run dev

# Terminal 2 — attention oracle 1 (port 4001)
cd oracle-node
set -a && source local-oracles/oracle_1.env && set +a
npm run dev

# Terminal 3 — oracle_2.env (port 4002), Terminal 4 — oracle_3.env (port 4003)
```

Each binds to its own PORT (4000/4001/4002/4003) — no port conflicts. Each env file
sets its own `ORACLE_KEYPAIR_JSON`, which overrides any shell-rc-exported
default so each oracle uses its own key.

On startup, look for one of:

- `[bridge] keypair matches lz_executor_authority — running as bridge relayer.`
- `[bridge] cross-chain disabled (no VISTA_GATEWAY_* env) — attention-only oracle.`

If you see `[bridge] FATAL:` the instance is misconfigured and will refuse to boot — fix the env mismatch as the message suggests.

## Register on-chain

After oracles are running, open Super-Dashboard at http://localhost:3031/oracle:

1. Connect Phantom with the wallet for `oracle_<N>` (import keypair JSON via Phantom: Settings → Manage Accounts → Import Private Key, paste the byte-array from `oracle_<N>.json`)
2. Click "Register" — dashboard shows endpoint URL input
3. Enter `http://localhost:400<N>`
4. Submit → wallet popup → approve → on-chain `register_oracle` runs
5. Repeat for oracle_2 and oracle_3 (switch wallet each time)

## Verify

After all 3 registered, hit the dashboard discovery endpoint:

```bash
curl http://localhost:3031/api/oracle/active-nodes | python3 -m json.tool
```

Should show 3 nodes with endpoint_url = `http://localhost:4001/2/3`.
