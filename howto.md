spl-token mint
2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm
<AMOUNT> \
 --recipient-owner <RECIPIENT_WALLET> \
 --url devnet

---

🚀 Cara run multi-oracle

Step A: Run 3 oracle-node instances (3 terminal terpisah)

cd oracle-node
unset ORACLE_KEYPAIR_JSON  
set -a && source local-oracles/oracle_1.env && set +a
npm run dev

lsof -ti tcp:4002 | xargs kill
cd oracle-node
unset ORACLE_KEYPAIR_JSON
set -a && source local-oracles/oracle_2.env && set +a
npm run dev

lsof -ti tcp:4003 | xargs kill
cd oracle-node
unset ORACLE_KEYPAIR_JSON
set -a && source local-oracles/oracle_3.env && set +a
npm run dev

export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com  
 export ANCHOR_WALLET=$HOME/.config/solana/id.json  
 npx ts-node scripts/mint-test-usdc.ts AZ8nJSfM4usUaVy2hRY5vNNNNy8xZtA57cCkQPH53qKt 1000

export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com  
 export ANCHOR_WALLET=$HOME/.config/solana/id.json  
 npx ts-node scripts/mint-test-usdc.ts FmWb3Bx78X26cdVB3GJuWeCnSpDhaMnyxxcrRQVSqVFB 1000

export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com  
 export ANCHOR_WALLET=$HOME/.config/solana/id.json  
 npx ts-node scripts/mint-test-usdc.ts 8A1Stkwy2H3cePGjwdKatsFVrLgdw66b5Mtwha3pRb5i 1000

oracle addresses:
AZ8nJSfM4usUaVy2hRY5vNNNNy8xZtA57cCkQPH53qKt
FmWb3Bx78X26cdVB3GJuWeCnSpDhaMnyxxcrRQVSqVFB
8A1Stkwy2H3cePGjwdKatsFVrLgdw66b5Mtwha3pRb5i

lsof -ti tcp:4001 tcp:4002 tcp:4003 | xargs kill 2>/dev/null

# Terminal 1 (di oracle-node/)

set -a && source local-oracles/oracle_1.env && set +a && npm run dev

# Terminal 2

set -a && source local-oracles/oracle_2.env && set +a && npm run dev

# Terminal 3

set -a && source local-oracles/oracle_3.env && set +a && npm run dev
