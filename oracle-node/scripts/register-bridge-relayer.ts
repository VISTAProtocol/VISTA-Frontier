/**
 * Register the bridge relayer keypair (FRTMLy9...) as an oracle in
 * oracle_registry, so the SDK's heartbeat broadcast also reaches port 4000
 * and the bridge relayer can crank cross-chain stream sessions.
 *
 * Idempotent: if the OracleNode PDA already exists, exits cleanly.
 *
 * Reads `bridge_config.usdc_mint`-equivalent: actually probes
 * `stake_vault.mint` directly so this works whether the registry uses Circle
 * USDC or the custom VISTA mint.
 *
 * If the relayer's ATA for the staking mint is short of `min_stake`, the
 * script tries to top it up by minting (only works if the relayer is the
 * mint authority — fine for the custom VISTA mint).
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *   ENDPOINT_URL=http://localhost:4000 \
 *   npx tsx scripts/register-bridge-relayer.ts
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

const ORACLE_REGISTRY_PROGRAM_ID = new PublicKey(
  "Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn",
);

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64Le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function main() {
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) throw new Error("ANCHOR_WALLET must be set");
  const endpointUrl = process.env.ENDPOINT_URL ?? "http://localhost:4000";

  const oracle = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))),
  );
  const conn = new Connection(rpcUrl, "confirmed");

  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    ORACLE_REGISTRY_PROGRAM_ID,
  );
  const [stakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake_vault")],
    ORACLE_REGISTRY_PROGRAM_ID,
  );
  const [oracleNodePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_node"), oracle.publicKey.toBuffer()],
    ORACLE_REGISTRY_PROGRAM_ID,
  );

  console.log("RPC:           ", rpcUrl);
  console.log("Registry:      ", registryPda.toBase58());
  console.log("StakeVault:    ", stakeVault.toBase58());
  console.log("Oracle:        ", oracle.publicKey.toBase58());
  console.log("OracleNodePDA: ", oracleNodePda.toBase58());
  console.log("Endpoint URL:  ", endpointUrl);

  const existing = await conn.getAccountInfo(oracleNodePda);
  if (existing) {
    console.log("\nAlready registered — nothing to do.");
    return;
  }

  // Read stake_vault to learn the staking mint.
  const stakeVaultAccount = await getAccount(conn, stakeVault, "confirmed");
  const stakeMint = stakeVaultAccount.mint;
  console.log("Staking mint:  ", stakeMint.toBase58());

  // Read Registry to know min_stake.
  const registryInfo = await conn.getAccountInfo(registryPda);
  if (!registryInfo) throw new Error("registry PDA not found");
  // Layout: disc(8) | admin(32) | attention_aggregator(32) | min_stake(8) | ...
  const minStake = registryInfo.data.readBigUInt64LE(8 + 32 + 32);
  console.log("Min stake:     ", minStake.toString());

  const oracleAta = getAssociatedTokenAddressSync(stakeMint, oracle.publicKey, true);
  console.log("Oracle ATA:    ", oracleAta.toBase58());

  const ixs: TransactionInstruction[] = [];

  // Idempotent ATA creation (covers first-run case).
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      oracle.publicKey,
      oracleAta,
      oracle.publicKey,
      stakeMint,
    ),
  );

  let currentBalance = 0n;
  try {
    const acct = await getAccount(conn, oracleAta, "confirmed");
    currentBalance = acct.amount;
  } catch (err) {
    if (!(err instanceof TokenAccountNotFoundError)) throw err;
  }
  console.log("Oracle balance:", currentBalance.toString());

  if (currentBalance < minStake) {
    const need = minStake - currentBalance;
    console.log(`Need ${need} more — attempting mint_to (only works if oracle == mint authority)`);

    const mint = await getMint(conn, stakeMint, "confirmed");
    if (!mint.mintAuthority || !mint.mintAuthority.equals(oracle.publicKey)) {
      throw new Error(
        `oracle is not mint authority for ${stakeMint.toBase58()} ` +
          `(authority = ${mint.mintAuthority?.toBase58() ?? "<frozen>"}). ` +
          `Fund the oracle ATA manually with ${need} of the staking token first.`,
      );
    }
    ixs.push(
      createMintToInstruction(stakeMint, oracleAta, oracle.publicKey, need),
    );
  }

  // register_oracle(stake: u64, endpoint_url: String)
  const endpointBytes = Buffer.from(endpointUrl, "utf-8");
  const endpointLen = Buffer.alloc(4);
  endpointLen.writeUInt32LE(endpointBytes.length);
  const data = Buffer.concat([
    disc("register_oracle"),
    u64Le(minStake),
    endpointLen,
    endpointBytes,
  ]);

  ixs.push(
    new TransactionInstruction({
      programId: ORACLE_REGISTRY_PROGRAM_ID,
      keys: [
        { pubkey: oracle.publicKey, isSigner: true, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: oracleNodePda, isSigner: false, isWritable: true },
        { pubkey: oracleAta, isSigner: false, isWritable: true },
        { pubkey: stakeVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    }),
  );

  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: oracle.publicKey,
    recentBlockhash: blockhash,
  });
  for (const ix of ixs) tx.add(ix);
  tx.sign(oracle);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");

  console.log("\nRegistered. tx:", sig);
  console.log("\nThe SDK should pick up the new endpoint on its next");
  console.log("/api/oracle/active-nodes refresh; restart Mock-Farcaster if");
  console.log("you want it immediately.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
