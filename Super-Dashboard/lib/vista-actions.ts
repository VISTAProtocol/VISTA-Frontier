import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

import {
  USDC_DECIMALS,
  USDC_MINT,
  campaignPda,
  campaignVaultAuthorityPda,
  campaignVaultPda,
  configPda,
  userBalancePda,
  userVaultPda,
  vaultAuthorityPda,
} from "./solana";
import type { VistaProtocol } from "./anchor/vista_protocol";

/**
 * Convert a decimal USDC amount (e.g. "10.5") to raw u64 (10_500_000).
 */
export function usdcToBn(value: number | string): BN {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  const raw = Math.round(amount * 10 ** USDC_DECIMALS);
  return new BN(raw);
}

/**
 * Advertiser deposits USDC into a fresh campaign vault.
 * Returns the tx signature.
 */
export async function depositCampaign(
  program: Program<VistaProtocol>,
  params: {
    campaignId: Uint8Array;
    advertiser: PublicKey;
    totalBudget: BN;
    ratePerSecond: BN;
    duration: BN;
  },
): Promise<string> {
  const { campaignId, advertiser, totalBudget, ratePerSecond, duration } = params;

  const [config] = configPda();
  const [campaign] = campaignPda(campaignId);
  const [campaignVaultAuthority] = campaignVaultAuthorityPda(campaignId);
  const [campaignVault] = campaignVaultPda(campaignId);
  const advertiserToken = await getAssociatedTokenAddress(USDC_MINT, advertiser);

  return program.methods
    .depositCampaign(
      Array.from(campaignId),
      totalBudget,
      ratePerSecond,
      duration,
    )
    .accounts({
      advertiser,
      config,
      campaign,
      campaignVaultAuthority,
      campaignVault,
      advertiserToken,
      usdcMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}

/**
 * User withdraws their accumulated balance to their USDC ATA.
 */
export async function withdraw(
  program: Program<VistaProtocol>,
  beneficiary: PublicKey,
): Promise<string> {
  const [config] = configPda();
  const [userBalance] = userBalancePda(beneficiary);
  const [userVault] = userVaultPda();
  const [vaultAuthority] = vaultAuthorityPda();
  const beneficiaryToken = await getAssociatedTokenAddress(
    USDC_MINT,
    beneficiary,
  );

  return program.methods
    .withdraw()
    .accounts({
      beneficiary,
      config,
      userBalance,
      userVault,
      vaultAuthority,
      beneficiaryToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * Read a user's pending balance (returns raw u64 as BN).
 * Returns null if the balance PDA doesn't exist yet (user has never earned).
 */
export async function fetchUserBalance(
  program: Program<VistaProtocol>,
  wallet: PublicKey,
): Promise<BN | null> {
  const [pda] = userBalancePda(wallet);
  try {
    const account = await program.account.userBalance.fetch(pda);
    return account.balance as BN;
  } catch {
    return null;
  }
}

/**
 * Read a campaign by id (returns null if not found).
 */
export async function fetchCampaign(
  program: Program<VistaProtocol>,
  campaignId: Uint8Array,
) {
  const [pda] = campaignPda(campaignId);
  try {
    return await program.account.campaign.fetch(pda);
  } catch {
    return null;
  }
}
