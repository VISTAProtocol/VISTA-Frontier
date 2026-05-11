import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

const VISTA_BRIDGE_PROGRAM_ID = new PublicKey(
  "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
);

// Anchor discriminator for `global:bridge_withdraw`
const BRIDGE_WITHDRAW_DISC = Buffer.from([250, 99, 215, 166, 81, 93, 185, 229]);

/// PDA seeded with `bridge_balance_v2` matching the post-escrow on-chain
/// layout. The old `bridge_balance` PDAs are orphaned but inert.
function bridgeBalancePda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_balance_v2"), wallet.toBuffer()],
    VISTA_BRIDGE_PROGRAM_ID,
  )[0];
}

function bridgeUserVaultPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_user_vault")],
    VISTA_BRIDGE_PROGRAM_ID,
  )[0];
}

function bridgeUserVaultAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_user_vault_authority")],
    VISTA_BRIDGE_PROGRAM_ID,
  )[0];
}

function bridgeConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    VISTA_BRIDGE_PROGRAM_ID,
  )[0];
}

/// Read `bridge_config.usdc_mint` from chain. Cross-chain user/publisher
/// withdrawals are settled in this mint. Mirrors the on-chain
/// `address = bridge_config.usdc_mint` constraint, so deriving the
/// beneficiary ATA against any other mint will revert.
async function fetchBridgeUsdcMint(connection: Connection): Promise<PublicKey> {
  const info = await connection.getAccountInfo(bridgeConfigPda());
  if (!info) throw new Error("bridge_config PDA not found");
  // BridgeConfig layout: disc(8) | admin(32) | usdc_mint(32) | ...
  return new PublicKey(info.data.subarray(8 + 32, 8 + 64));
}

/// Returns the wallet's withdrawable cross-chain balance (raw u64) or 0n if
/// the BridgeUserBalance PDA doesn't exist yet (= never earned).
export async function fetchBridgeBalance(
  connection: Connection,
  wallet: PublicKey,
): Promise<bigint> {
  const pda = bridgeBalancePda(wallet);
  const info = await connection.getAccountInfo(pda);
  if (!info) return BigInt(0);
  // BridgeUserBalance layout: disc(8) | wallet(32) | lifetime_earned(8) | balance(8) | bump(1)
  if (info.data.length < 8 + 32 + 8 + 8) return BigInt(0);
  return info.data.readBigUInt64LE(8 + 32 + 8);
}

/// Beneficiary withdraws their accumulated cross-chain earnings from the
/// bridge_user_vault PDA into their own USDC ATA. The wallet adapter signs.
/// Idempotently creates the beneficiary's ATA if missing (~2k lamports rent
/// paid by the beneficiary).
export async function bridgeWithdraw(
  connection: Connection,
  wallet: AnchorWallet,
): Promise<string> {
  const beneficiary = wallet.publicKey;
  const usdcMint = await fetchBridgeUsdcMint(connection);
  const beneficiaryToken = await getAssociatedTokenAddress(usdcMint, beneficiary);

  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    beneficiary,
    beneficiaryToken,
    beneficiary,
    usdcMint,
  );

  const withdrawIx = new TransactionInstruction({
    programId: VISTA_BRIDGE_PROGRAM_ID,
    keys: [
      { pubkey: beneficiary, isSigner: true, isWritable: true },
      { pubkey: bridgeConfigPda(), isSigner: false, isWritable: false },
      { pubkey: bridgeBalancePda(beneficiary), isSigner: false, isWritable: true },
      { pubkey: bridgeUserVaultPda(), isSigner: false, isWritable: true },
      { pubkey: bridgeUserVaultAuthorityPda(), isSigner: false, isWritable: false },
      { pubkey: beneficiaryToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: BRIDGE_WITHDRAW_DISC,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: beneficiary,
    recentBlockhash: blockhash,
  });
  tx.add(createAtaIx, withdrawIx);

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
