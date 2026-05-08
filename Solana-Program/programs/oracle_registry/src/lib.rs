use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn");

// Same canonical USDC mint used by vista_protocol on devnet.
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Default minimum stake (100 USDC, 6 decimals).
pub const DEFAULT_MIN_STAKE: u64 = 100_000_000;

// Stake lockup after unregister — 7 days.
pub const UNSTAKE_LOCKUP_SECONDS: i64 = 7 * 24 * 60 * 60;

#[program]
pub mod oracle_registry {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        attention_aggregator: Pubkey,
        min_stake: u64,
        slash_bps: u16,
    ) -> Result<()> {
        require!(slash_bps <= 10_000, OracleRegistryError::InvalidSlashBps);
        let r = &mut ctx.accounts.registry;
        r.admin = ctx.accounts.admin.key();
        r.attention_aggregator = attention_aggregator;
        r.min_stake = if min_stake == 0 { DEFAULT_MIN_STAKE } else { min_stake };
        r.slash_bps = slash_bps;
        r.total_nodes = 0;
        r.bump = ctx.bumps.registry;
        r.stake_authority_bump = ctx.bumps.stake_authority;
        r.reward_authority_bump = ctx.bumps.reward_authority;
        Ok(())
    }

    pub fn set_attention_aggregator(
        ctx: Context<AdminUpdate>,
        attention_aggregator: Pubkey,
    ) -> Result<()> {
        ctx.accounts.registry.attention_aggregator = attention_aggregator;
        emit!(AggregatorSet { attention_aggregator });
        Ok(())
    }

    pub fn register_oracle(
        ctx: Context<RegisterOracle>,
        stake_amount: u64,
        endpoint_url: String,
    ) -> Result<()> {
        require!(
            stake_amount >= ctx.accounts.registry.min_stake,
            OracleRegistryError::StakeBelowMinimum
        );
        require!(endpoint_url.len() <= 200, OracleRegistryError::EndpointTooLong);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.oracle_token.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.oracle.to_account_info(),
                },
            ),
            stake_amount,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let node = &mut ctx.accounts.oracle_node;
        node.oracle = ctx.accounts.oracle.key();
        node.endpoint_url = endpoint_url.clone();
        node.stake = stake_amount;
        node.reward_balance = 0;
        node.reputation = 0;
        node.total_submissions = 0;
        node.total_slashes = 0;
        node.registered_at = now;
        node.unregistered_at = 0;
        node.active = true;
        node.bump = ctx.bumps.oracle_node;

        let registry = &mut ctx.accounts.registry;
        registry.total_nodes = registry.total_nodes.saturating_add(1);

        emit!(OracleRegistered {
            oracle: node.oracle,
            stake: stake_amount,
            endpoint_url,
            timestamp: now,
        });
        Ok(())
    }

    pub fn unregister_oracle(ctx: Context<UnregisterOracle>) -> Result<()> {
        let node = &mut ctx.accounts.oracle_node;
        require!(node.active, OracleRegistryError::AlreadyInactive);
        require!(
            node.oracle == ctx.accounts.oracle.key(),
            OracleRegistryError::NotOracleOwner
        );

        let now = Clock::get()?.unix_timestamp;
        node.active = false;
        node.unregistered_at = now;

        emit!(OracleUnregistered {
            oracle: node.oracle,
            timestamp: now,
        });
        Ok(())
    }

    pub fn withdraw_stake(ctx: Context<WithdrawStake>) -> Result<()> {
        let node = &ctx.accounts.oracle_node;
        require!(!node.active, OracleRegistryError::StillActive);
        require!(
            node.oracle == ctx.accounts.oracle.key(),
            OracleRegistryError::NotOracleOwner
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= node.unregistered_at + UNSTAKE_LOCKUP_SECONDS,
            OracleRegistryError::LockupActive
        );
        require!(node.stake > 0, OracleRegistryError::NothingToWithdraw);

        let amount = node.stake;
        let bump = ctx.accounts.registry.stake_authority_bump;
        let seeds: &[&[u8]] = &[b"stake_authority", &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.oracle_token.to_account_info(),
                    authority: ctx.accounts.stake_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        let node_mut = &mut ctx.accounts.oracle_node;
        node_mut.stake = 0;

        emit!(StakeWithdrawn {
            oracle: node_mut.oracle,
            amount,
            timestamp: now,
        });
        Ok(())
    }

    /// Reduces an oracle's stake. Only callable via CPI by the
    /// attention_aggregator program (verified through the aggregator_signer PDA).
    pub fn slash_oracle(ctx: Context<SlashOrCredit>, amount: u64) -> Result<()> {
        let registry = &ctx.accounts.registry;
        let expected_signer = Pubkey::find_program_address(
            &[b"aggregator_signer"],
            &registry.attention_aggregator,
        )
        .0;
        require_keys_eq!(
            ctx.accounts.aggregator_signer.key(),
            expected_signer,
            OracleRegistryError::NotAggregator
        );

        let node = &mut ctx.accounts.oracle_node;
        let actual = amount.min(node.stake);
        node.stake -= actual;
        node.total_slashes = node.total_slashes.saturating_add(actual);
        node.reputation = node.reputation.saturating_sub(1);

        emit!(OracleSlashed {
            oracle: node.oracle,
            amount: actual,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Adds to oracle's claimable USDC reward balance. Only callable via CPI
    /// by the attention_aggregator (after it has deposited the corresponding
    /// USDC into the RewardVault).
    pub fn credit_reward(
        ctx: Context<SlashOrCredit>,
        amount: u64,
        session_id: [u8; 32],
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        let expected_signer = Pubkey::find_program_address(
            &[b"aggregator_signer"],
            &registry.attention_aggregator,
        )
        .0;
        require_keys_eq!(
            ctx.accounts.aggregator_signer.key(),
            expected_signer,
            OracleRegistryError::NotAggregator
        );

        let node = &mut ctx.accounts.oracle_node;
        node.reward_balance = node
            .reward_balance
            .checked_add(amount)
            .ok_or(OracleRegistryError::Overflow)?;
        node.total_submissions = node.total_submissions.saturating_add(1);
        node.reputation = node.reputation.saturating_add(1);

        emit!(RewardCredited {
            oracle: node.oracle,
            amount,
            session_id,
        });
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let node = &ctx.accounts.oracle_node;
        require!(
            node.oracle == ctx.accounts.oracle.key(),
            OracleRegistryError::NotOracleOwner
        );
        require!(node.reward_balance > 0, OracleRegistryError::NothingToClaim);

        let amount = node.reward_balance;
        let bump = ctx.accounts.registry.reward_authority_bump;
        let seeds: &[&[u8]] = &[b"reward_authority", &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.oracle_token.to_account_info(),
                    authority: ctx.accounts.reward_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        let node_mut = &mut ctx.accounts.oracle_node;
        node_mut.reward_balance = 0;

        emit!(RewardsClaimed {
            oracle: node_mut.oracle,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ─────────────────────────────── Accounts ───────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Registry::SIZE,
        seeds = [b"registry"],
        bump,
    )]
    pub registry: Account<'info, Registry>,

    pub usdc_mint: Account<'info, Mint>,

    /// CHECK: PDA authority for stake_vault.
    #[account(seeds = [b"stake_authority"], bump)]
    pub stake_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = stake_authority,
        seeds = [b"stake_vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for reward_vault.
    #[account(seeds = [b"reward_authority"], bump)]
    pub reward_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = reward_authority,
        seeds = [b"reward_vault"],
        bump,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry.bump,
        has_one = admin @ OracleRegistryError::NotAdmin,
    )]
    pub registry: Account<'info, Registry>,
}

#[derive(Accounts)]
pub struct RegisterOracle<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(mut, seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(
        init,
        payer = oracle,
        space = 8 + OracleNode::SIZE,
        seeds = [b"oracle_node", oracle.key().as_ref()],
        bump,
    )]
    pub oracle_node: Account<'info, OracleNode>,

    #[account(mut, token::mint = stake_vault.mint)]
    pub oracle_token: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"stake_vault"], bump)]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnregisterOracle<'info> {
    pub oracle: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle_node", oracle.key().as_ref()],
        bump = oracle_node.bump,
    )]
    pub oracle_node: Account<'info, OracleNode>,
}

#[derive(Accounts)]
pub struct WithdrawStake<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [b"oracle_node", oracle.key().as_ref()],
        bump = oracle_node.bump,
    )]
    pub oracle_node: Account<'info, OracleNode>,

    #[account(mut, seeds = [b"stake_vault"], bump)]
    pub stake_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA signer for stake_vault.
    #[account(seeds = [b"stake_authority"], bump = registry.stake_authority_bump)]
    pub stake_authority: UncheckedAccount<'info>,

    #[account(mut, token::authority = oracle)]
    pub oracle_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SlashOrCredit<'info> {
    /// CHECK: PDA derived from the attention_aggregator program. Verified inside
    /// the instruction handler against `registry.attention_aggregator`.
    pub aggregator_signer: Signer<'info>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [b"oracle_node", oracle_node.oracle.as_ref()],
        bump = oracle_node.bump,
    )]
    pub oracle_node: Account<'info, OracleNode>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [b"oracle_node", oracle.key().as_ref()],
        bump = oracle_node.bump,
    )]
    pub oracle_node: Account<'info, OracleNode>,

    #[account(mut, seeds = [b"reward_vault"], bump)]
    pub reward_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA signer for reward_vault.
    #[account(seeds = [b"reward_authority"], bump = registry.reward_authority_bump)]
    pub reward_authority: UncheckedAccount<'info>,

    #[account(mut, token::authority = oracle)]
    pub oracle_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────── State ───────────────────────────────

#[account]
pub struct Registry {
    pub admin: Pubkey,
    pub attention_aggregator: Pubkey,
    pub min_stake: u64,
    pub slash_bps: u16,
    pub total_nodes: u32,
    pub bump: u8,
    pub stake_authority_bump: u8,
    pub reward_authority_bump: u8,
}
impl Registry {
    pub const SIZE: usize = 32 + 32 + 8 + 2 + 4 + 1 + 1 + 1;
}

#[account]
pub struct OracleNode {
    pub oracle: Pubkey,
    pub endpoint_url: String,
    pub stake: u64,
    pub reward_balance: u64,
    pub reputation: i64,
    pub total_submissions: u64,
    pub total_slashes: u64,
    pub registered_at: i64,
    pub unregistered_at: i64,
    pub active: bool,
    pub bump: u8,
}
impl OracleNode {
    // 4-byte string length prefix + max 200 char endpoint
    pub const SIZE: usize = 32 + (4 + 200) + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

// ─────────────────────────────── Events ───────────────────────────────

#[event]
pub struct OracleRegistered {
    pub oracle: Pubkey,
    pub stake: u64,
    pub endpoint_url: String,
    pub timestamp: i64,
}

#[event]
pub struct OracleUnregistered {
    pub oracle: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OracleSlashed {
    pub oracle: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardCredited {
    pub oracle: Pubkey,
    pub amount: u64,
    pub session_id: [u8; 32],
}

#[event]
pub struct RewardsClaimed {
    pub oracle: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct StakeWithdrawn {
    pub oracle: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AggregatorSet {
    pub attention_aggregator: Pubkey,
}

// ─────────────────────────────── Errors ───────────────────────────────

#[error_code]
pub enum OracleRegistryError {
    #[msg("Caller is not the admin")]
    NotAdmin,
    #[msg("Caller is not the oracle owner")]
    NotOracleOwner,
    #[msg("Caller is not the attention_aggregator program signer")]
    NotAggregator,
    #[msg("Stake amount is below the configured minimum")]
    StakeBelowMinimum,
    #[msg("Oracle is already inactive")]
    AlreadyInactive,
    #[msg("Oracle is still active — must unregister first")]
    StillActive,
    #[msg("Stake lockup is still in effect")]
    LockupActive,
    #[msg("Endpoint URL is too long (max 200 chars)")]
    EndpointTooLong,
    #[msg("Invalid slash basis points (must be <= 10000)")]
    InvalidSlashBps,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Arithmetic overflow")]
    Overflow,
}
