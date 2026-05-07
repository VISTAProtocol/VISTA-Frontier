import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

import oracleRegistryIdl from "./idl/oracle_registry.json";
import type { OracleRegistry } from "./anchor/oracle_registry";
import {
  ORACLE_MIN_STAKE_RAW,
  USDC_MINT,
  oracleNodePda,
  rewardAuthorityPda,
  rewardVaultPda,
  registryPda,
  stakeAuthorityPda,
  stakeVaultPda,
} from "./solana";

export function getOracleRegistryProgram(
  provider: AnchorProvider,
): Program<OracleRegistry> {
  return new Program<OracleRegistry>(
    oracleRegistryIdl as Idl as OracleRegistry,
    provider,
  );
}

/**
 * Register an oracle node by transferring USDC stake into the registry's
 * StakeVault and creating an OracleNode PDA. `stakeAtoms` defaults to the
 * configured minimum (100 USDC).
 */
export async function registerOracle(
  program: Program<OracleRegistry>,
  params: {
    oracle: PublicKey;
    endpointUrl: string;
    stakeAtoms?: BN;
  },
): Promise<string> {
  const { oracle, endpointUrl } = params;
  const stakeAtoms = params.stakeAtoms ?? new BN(ORACLE_MIN_STAKE_RAW);
  const [registry] = registryPda();
  const [oracleNode] = oracleNodePda(oracle);
  const [stakeVault] = stakeVaultPda();
  const oracleToken = await getAssociatedTokenAddress(USDC_MINT, oracle);

  return program.methods
    .registerOracle(stakeAtoms, endpointUrl)
    .accountsPartial({
      oracle,
      registry,
      oracleNode,
      oracleToken,
      stakeVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}

/**
 * Mark the oracle as inactive. Stake remains locked for 7 days from this
 * timestamp; call `withdrawStake` afterwards to recover it.
 */
export async function unregisterOracle(
  program: Program<OracleRegistry>,
  oracle: PublicKey,
): Promise<string> {
  const [oracleNode] = oracleNodePda(oracle);
  return program.methods
    .unregisterOracle()
    .accountsPartial({ oracle, oracleNode })
    .rpc();
}

/**
 * Pull the oracle's pending USDC reward balance into their ATA.
 */
export async function claimRewards(
  program: Program<OracleRegistry>,
  oracle: PublicKey,
): Promise<string> {
  const [registry] = registryPda();
  const [oracleNode] = oracleNodePda(oracle);
  const [rewardVault] = rewardVaultPda();
  const [rewardAuthority] = rewardAuthorityPda();
  const oracleToken = await getAssociatedTokenAddress(USDC_MINT, oracle);

  return program.methods
    .claimRewards()
    .accountsPartial({
      oracle,
      registry,
      oracleNode,
      rewardVault,
      rewardAuthority,
      oracleToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * Pull the oracle's stake back to their ATA after the 7-day lockup. Will
 * revert on-chain if called before the lockup expires.
 */
export async function withdrawStake(
  program: Program<OracleRegistry>,
  oracle: PublicKey,
): Promise<string> {
  const [registry] = registryPda();
  const [oracleNode] = oracleNodePda(oracle);
  const [stakeVault] = stakeVaultPda();
  const [stakeAuthority] = stakeAuthorityPda();
  const oracleToken = await getAssociatedTokenAddress(USDC_MINT, oracle);

  return program.methods
    .withdrawStake()
    .accountsPartial({
      oracle,
      registry,
      oracleNode,
      stakeVault,
      stakeAuthority,
      oracleToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * Read the on-chain OracleNode account for a given oracle pubkey. Returns
 * null if the pubkey is not registered.
 */
export async function fetchOracleNode(
  program: Program<OracleRegistry>,
  oracle: PublicKey,
) {
  const [pda] = oracleNodePda(oracle);
  try {
    return await program.account.oracleNode.fetch(pda);
  } catch {
    return null;
  }
}
