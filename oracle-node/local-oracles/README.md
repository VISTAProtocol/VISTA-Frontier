# Local multi-oracle setup

Three oracle keypairs + env files for running 3 oracle-node instances on localhost ports 4001-4003.

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

## Run all 3 in parallel

Open 3 terminals. In each:

```bash
# Terminal 1
cd oracle-node
set -a && source local-oracles/oracle_1.env && set +a
npm run dev

# Terminal 2 (same pattern, oracle_2.env)
# Terminal 3 (same pattern, oracle_3.env)
```

Each binds to its own PORT (4001/4002/4003) — no port conflicts. Each env file
sets its own `ORACLE_KEYPAIR_JSON`, which overrides any shell-rc-exported
default so each oracle uses its own key.

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
