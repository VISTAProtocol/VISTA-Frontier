use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

// Placeholder program ID for PoC. Replace during deployment.
// This program expects LayerZero V2 executor to act as mint authority.
declare_id!("9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE");

#[program]
pub mod vista_bridge {
    use super::*;

    pub fn claim(ctx: Context<Claim>, claim_id: [u8; 32], amount: u64) -> Result<()> {
        let record = &mut ctx.accounts.claim_record;
        require!(!record.claimed, VistaBridgeError::AlreadyClaimed);
        record.claimed = true;
        record.claim_id = claim_id;
        record.claimer = ctx.accounts.claimer.key();

        let cpi_accounts = MintTo {
            mint: ctx.accounts.vista_mint.to_account_info(),
            to: ctx.accounts.claimer_token.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::mint_to(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(claim_id: [u8; 32])]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(mut)]
    pub vista_mint: Account<'info, Mint>,
    #[account(mut)]
    pub claimer_token: Account<'info, TokenAccount>,
    /// CHECK: LayerZero executor PDA should be set as mint authority.
    pub mint_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = claimer,
        space = 8 + ClaimRecord::SIZE,
        seeds = [b"claim", claim_id.as_ref()],
        bump
    )]
    pub claim_record: Account<'info, ClaimRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct ClaimRecord {
    pub claim_id: [u8; 32],
    pub claimer: Pubkey,
    pub claimed: bool,
}

impl ClaimRecord {
    pub const SIZE: usize = 32 + 32 + 1;
}

#[error_code]
pub enum VistaBridgeError {
    #[msg("Claim already processed")]
    AlreadyClaimed,
}
