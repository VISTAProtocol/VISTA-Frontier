spl-token mint
2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm
<AMOUNT> \
 --recipient-owner <RECIPIENT_WALLET> \
 --url devnet

---

🚀 Cara run multi-oracle

Step A: Run 3 oracle-node instances (3 terminal terpisah)

Terminal 1 (oracle_1, port 4001):
cd oracle-node  
 export $(grep -v '^#' local-oracles/oracle_1.env | xargs)
npm run dev

Terminal 2 (oracle_2, port 4002):  
 cd oracle-node  
 export $(grep -v '^#' local-oracles/oracle_2.env | xargs)  
 npm run dev

Terminal 3 (oracle_3, port 4003):  
 cd oracle-node  
 export $(grep -v '^#' local-oracles/oracle_3.env | xargs)
npm run dev

cd /Users/scientivan/Programming/VISTA/Vista-Frontier/Solana-Program

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
