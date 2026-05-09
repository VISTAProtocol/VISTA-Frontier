import { BN, Program } from "@anchor-lang/core";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
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
    .accountsPartial({
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
 * Advertiser pulls remaining campaign budget back to their USDC ATA. Closes
 * the campaign as a side effect.
 */
export async function refundCampaign(
  program: Program<VistaProtocol>,
  params: {
    campaignId: Uint8Array;
    advertiser: PublicKey;
  },
): Promise<string> {
  const { campaignId, advertiser } = params;
  const [campaign] = campaignPda(campaignId);
  const [campaignVaultAuthority] = campaignVaultAuthorityPda(campaignId);
  const [campaignVault] = campaignVaultPda(campaignId);
  const advertiserToken = await getAssociatedTokenAddress(USDC_MINT, advertiser);

  return program.methods
    .refundCampaign()
    .accountsPartial({
      advertiser,
      campaign,
      campaignVaultAuthority,
      campaignVault,
      advertiserToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * User (or publisher) withdraws their accumulated balance to their USDC ATA.
 *
 * Two failure modes the on-chain instruction can hit, both fixed here:
 *
 *  1. `beneficiary_token` (the user's USDC ATA) doesn't exist yet → Anchor
 *     fails with `AccountNotInitialized`. We prepend an idempotent ATA
 *     creation as a `preInstruction`; the beneficiary pays ~2k lamports of
 *     rent for their own ATA in the same tx.
 *
 *  2. The `USDC_MINT` baked into `lib/solana.ts` (from
 *     `NEXT_PUBLIC_USDC_MINT`) drifts from the actual mint on-chain
 *     (`config.usdc_mint`, set during `initialize`). The user_vault was
 *     created against the on-chain mint, so an ATA derived against the
 *     wrong mint mismatches user_vault and the SPL token transfer reverts.
 *     We dodge this entirely by fetching the on-chain mint at call time —
 *     dev-env env-var drift cannot cause a wrong-mint withdrawal anymore.
 */
export async function withdraw(
  program: Program<VistaProtocol>,
  beneficiary: PublicKey,
): Promise<string> {
  const [config] = configPda();
  const [userBalance] = userBalancePda(beneficiary);
  const [userVault] = userVaultPda();
  const [vaultAuthority] = vaultAuthorityPda();

  // Source of truth for the settlement mint is on-chain. Fall back to env-
  // derived USDC_MINT only if the fetch fails (e.g. RPC blip).
  let mint: PublicKey;
  try {
    const cfgAccount = await program.account.config.fetch(config);
    mint = cfgAccount.usdcMint as PublicKey;
  } catch {
    mint = USDC_MINT;
  }

  const beneficiaryToken = await getAssociatedTokenAddress(mint, beneficiary);
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    beneficiary, // payer
    beneficiaryToken, // ata
    beneficiary, // owner
    mint,
  );

  return program.methods
    .withdraw()
    .accountsPartial({
      beneficiary,
      config,
      userBalance,
      userVault,
      vaultAuthority,
      beneficiaryToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([createAtaIx])
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
