use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM");

// Canonical Vista settlement mint. Admin should pass this exact mint to
// `initialize` on devnet. After init, `config.usdc_mint` is immutable and all
// subsequent instructions enforce it. For mainnet, swap this constant.
// Faucet: https://faucet.circle.com (select Solana devnet, USDC).
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Revenue split (out of 100). VISTA fee = 100 - USER_PCT - PUBLISHER_PCT - VALIDATOR_PCT,
// computed as remainder so integer-division dust is absorbed by the protocol.
const USER_PCT: u64 = 30;
const PUBLISHER_PCT: u64 = 50;
const VALIDATOR_PCT: u64 = 10;

// Address of the attention_aggregator program. drain_validator_pool checks
// that the CPI caller's signer PDA derives from this program ID.
#[constant]
pub const ATTENTION_AGGREGATOR_ID: Pubkey = pubkey!("6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH");

#[program]
pub mod vista_protocol {
    use super::*;

    // ──────────────────────────── Admin ────────────────────────────

    pub fn initialize(ctx: Context<Initialize>, oracle: Pubkey, vista_wallet: Pubkey) -> Result<()> {
        require!(oracle != Pubkey::default(), VistaError::ZeroAddress);
        require!(vista_wallet != Pubkey::default(), VistaError::ZeroAddress);

        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.usdc_mint = ctx.accounts.usdc_mint.key();
        cfg.oracle = oracle;
        cfg.vista_wallet = vista_wallet;
        cfg.bump = ctx.bumps.config;
        cfg.vault_authority_bump = ctx.bumps.vault_authority;

        let counter = &mut ctx.accounts.receipt_counter;
        counter.next_id = 0;
        counter.bump = ctx.bumps.receipt_counter;

        Ok(())
    }

    pub fn set_oracle(ctx: Context<AdminUpdate>, oracle: Pubkey) -> Result<()> {
        require!(oracle != Pubkey::default(), VistaError::ZeroAddress);
        ctx.accounts.config.oracle = oracle;
        emit!(OracleSet { oracle });
        Ok(())
    }

    pub fn set_vista_wallet(ctx: Context<AdminUpdate>, vista_wallet: Pubkey) -> Result<()> {
        require!(vista_wallet != Pubkey::default(), VistaError::ZeroAddress);
        ctx.accounts.config.vista_wallet = vista_wallet;
        emit!(VistaWalletSet { vista_wallet });
        Ok(())
    }

    // ────────────────────── Escrow: campaign ──────────────────────

    /// Advertiser deposits USDC into a fresh campaign vault.
    /// `campaign_id` is a 32-byte unique identifier (e.g. keccak256 hash from off-chain).
    pub fn deposit_campaign(
        ctx: Context<DepositCampaign>,
        campaign_id: [u8; 32],
        amount: u64,
        rate_per_second: u64,
        duration: u64,
    ) -> Result<()> {
        require!(amount > 0, VistaError::ZeroAmount);
        require!(rate_per_second > 0, VistaError::ZeroRate);
        require!(duration > 0, VistaError::ZeroDuration);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.advertiser_token.to_account_info(),
                    to: ctx.accounts.campaign_vault.to_account_info(),
                    authority: ctx.accounts.advertiser.to_account_info(),
                },
            ),
            amount,
        )?;

        let c = &mut ctx.accounts.campaign;
        c.campaign_id = campaign_id;
        c.advertiser = ctx.accounts.advertiser.key();
        c.total_budget = amount;
        c.remaining_budget = amount;
        c.rate_per_second = rate_per_second;
        c.duration = duration;
        c.active = true;
        c.created_at = Clock::get()?.unix_timestamp;
        c.bump = ctx.bumps.campaign;
        c.vault_authority_bump = ctx.bumps.campaign_vault_authority;

        emit!(CampaignCreated {
            campaign_id,
            advertiser: c.advertiser,
            amount,
            rate_per_second,
        });
        Ok(())
    }

    /// Advertiser pulls remaining budget back and ends the campaign.
    pub fn refund_campaign(ctx: Context<RefundCampaign>) -> Result<()> {
        let c = &mut ctx.accounts.campaign;
        require!(ctx.accounts.advertiser.key() == c.advertiser, VistaError::NotAdvertiser);
        require!(c.active, VistaError::CampaignNotActive);
        require!(c.remaining_budget > 0, VistaError::NothingToRefund);

        let refund = c.remaining_budget;
        c.remaining_budget = 0;
        c.active = false;

        let campaign_id = c.campaign_id;
        let bump = c.vault_authority_bump;
        let seeds: &[&[u8]] = &[b"campaign_vault_authority", campaign_id.as_ref(), &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.campaign_vault.to_account_info(),
                    to: ctx.accounts.advertiser_token.to_account_info(),
                    authority: ctx.accounts.campaign_vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            refund,
        )?;

        emit!(CampaignEnded { campaign_id, refunded_amount: refund });
        Ok(())
    }

    // ──────────────────── Stream: oracle settlement ────────────────────

    pub fn start_stream(
        ctx: Context<StartStream>,
        session_id: [u8; 32],
        campaign_id: [u8; 32],
    ) -> Result<()> {
        require!(ctx.accounts.oracle.key() == ctx.accounts.config.oracle, VistaError::NotOracle);
        let c = &ctx.accounts.campaign;
        require!(c.campaign_id == campaign_id, VistaError::CampaignMismatch);
        require!(c.active, VistaError::CampaignNotActive);

        let s = &mut ctx.accounts.session;
        s.session_id = session_id;
        s.campaign_id = campaign_id;
        s.user_wallet = ctx.accounts.user_wallet.key();
        s.publisher_wallet = ctx.accounts.publisher_wallet.key();
        s.seconds_verified = 0;
        s.total_paid = 0;
        s.active = true;
        s.started_at = Clock::get()?.unix_timestamp;
        s.bump = ctx.bumps.session;

        emit!(StreamStarted {
            session_id,
            campaign_id,
            user_wallet: s.user_wallet,
            publisher_wallet: s.publisher_wallet,
        });
        Ok(())
    }

    /// Oracle verifies attention seconds; we deduct from the campaign vault
    /// and split into the user pool (vault) plus protocol fee.
    pub fn tick_stream(ctx: Context<TickStream>, seconds_elapsed: u64) -> Result<()> {
        require!(ctx.accounts.oracle.key() == ctx.accounts.config.oracle, VistaError::NotOracle);
        require!(seconds_elapsed > 0, VistaError::ZeroSeconds);

        let session = &mut ctx.accounts.session;
        require!(session.active, VistaError::SessionNotActive);

        let campaign = &mut ctx.accounts.campaign;
        require!(campaign.campaign_id == session.campaign_id, VistaError::CampaignMismatch);
        require!(campaign.active, VistaError::CampaignExhausted);

        let total_amount = campaign
            .rate_per_second
            .checked_mul(seconds_elapsed)
            .ok_or(VistaError::Overflow)?;
        require!(campaign.remaining_budget >= total_amount, VistaError::InsufficientBudget);

        let user_amount = total_amount
            .checked_mul(USER_PCT)
            .ok_or(VistaError::Overflow)?
            / 100;
        let publisher_amount = total_amount
            .checked_mul(PUBLISHER_PCT)
            .ok_or(VistaError::Overflow)?
            / 100;
        let validator_amount = total_amount
            .checked_mul(VALIDATOR_PCT)
            .ok_or(VistaError::Overflow)?
            / 100;
        let vista_amount = total_amount - user_amount - publisher_amount - validator_amount;

        // Move USDC: campaign_vault → user_vault (user+publisher pool),
        // → validator_pool_vault (per-session escrow drained by aggregator),
        // → vista_wallet ATA (protocol fee).
        let campaign_id = campaign.campaign_id;
        let cv_bump = campaign.vault_authority_bump;
        let cv_seeds: &[&[u8]] = &[b"campaign_vault_authority", campaign_id.as_ref(), &[cv_bump]];
        let signer_seeds = &[cv_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.campaign_vault.to_account_info(),
                    to: ctx.accounts.user_vault.to_account_info(),
                    authority: ctx.accounts.campaign_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            user_amount + publisher_amount,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.campaign_vault.to_account_info(),
                    to: ctx.accounts.validator_pool_vault.to_account_info(),
                    authority: ctx.accounts.campaign_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            validator_amount,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.campaign_vault.to_account_info(),
                    to: ctx.accounts.vista_wallet_token.to_account_info(),
                    authority: ctx.accounts.campaign_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            vista_amount,
        )?;

        campaign.remaining_budget -= total_amount;
        if campaign.remaining_budget == 0 {
            campaign.active = false;
        }

        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.wallet = session.user_wallet;
        user_balance.balance = user_balance
            .balance
            .checked_add(user_amount)
            .ok_or(VistaError::Overflow)?;
        user_balance.bump = ctx.bumps.user_balance;

        let publisher_balance = &mut ctx.accounts.publisher_balance;
        publisher_balance.wallet = session.publisher_wallet;
        publisher_balance.balance = publisher_balance
            .balance
            .checked_add(publisher_amount)
            .ok_or(VistaError::Overflow)?;
        publisher_balance.bump = ctx.bumps.publisher_balance;

        session.seconds_verified += seconds_elapsed;
        session.total_paid += total_amount;

        emit!(StreamTick {
            session_id: session.session_id,
            user_wallet: session.user_wallet,
            publisher_wallet: session.publisher_wallet,
            total_amount,
            user_amount,
            publisher_amount,
            validator_amount,
            vista_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        emit!(Credited {
            wallet: session.user_wallet,
            session_id: session.session_id,
            campaign_id: session.campaign_id,
            amount: user_amount,
            role: 0,
        });
        emit!(Credited {
            wallet: session.publisher_wallet,
            session_id: session.session_id,
            campaign_id: session.campaign_id,
            amount: publisher_amount,
            role: 1,
        });
        Ok(())
    }

    /// Drain a session's validator pool to the oracle_registry RewardVault.
    /// CPI-only — caller must pass the aggregator_signer PDA derived from
    /// ATTENTION_AGGREGATOR_ID.
    pub fn drain_validator_pool(
        ctx: Context<DrainValidatorPool>,
        session_id: [u8; 32],
    ) -> Result<u64> {
        let expected_signer =
            Pubkey::find_program_address(&[b"aggregator_signer"], &ATTENTION_AGGREGATOR_ID).0;
        require_keys_eq!(
            ctx.accounts.aggregator_signer.key(),
            expected_signer,
            VistaError::NotAggregator
        );

        let amount = ctx.accounts.validator_pool_vault.amount;
        require!(amount > 0, VistaError::EmptyPool);

        let bump = ctx.bumps.validator_pool_authority;
        let seeds: &[&[u8]] = &[b"validator_pool_authority", session_id.as_ref(), &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.validator_pool_vault.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.validator_pool_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(ValidatorPoolDrained {
            session_id,
            amount,
            reward_vault: ctx.accounts.reward_vault.key(),
        });
        Ok(amount)
    }

    /// Closes the session and mints a soulbound receipt PDA to the viewer.
    pub fn end_stream(ctx: Context<EndStream>) -> Result<()> {
        require!(ctx.accounts.oracle.key() == ctx.accounts.config.oracle, VistaError::NotOracle);

        let session = &mut ctx.accounts.session;
        require!(session.active, VistaError::SessionNotActive);
        session.active = false;

        let campaign = &ctx.accounts.campaign;
        require!(campaign.campaign_id == session.campaign_id, VistaError::CampaignMismatch);

        let counter = &mut ctx.accounts.receipt_counter;
        let token_id = counter.next_id;
        counter.next_id = counter.next_id.checked_add(1).ok_or(VistaError::Overflow)?;

        let r = &mut ctx.accounts.receipt;
        r.token_id = token_id;
        r.session_id = session.session_id;
        r.user_wallet = session.user_wallet;
        r.advertiser = campaign.advertiser;
        r.campaign_id = session.campaign_id;
        r.publisher_wallet = session.publisher_wallet;
        r.seconds_verified = session.seconds_verified;
        r.usdc_paid = session.total_paid;
        r.timestamp = Clock::get()?.unix_timestamp;
        r.bump = ctx.bumps.receipt;

        emit!(ReceiptMinted {
            user: session.user_wallet,
            token_id,
            session_id: session.session_id,
            campaign_id: session.campaign_id,
            seconds_verified: session.seconds_verified,
            usdc_paid: session.total_paid,
        });
        emit!(StreamEnded {
            session_id: session.session_id,
            seconds_verified: session.seconds_verified,
            total_paid: session.total_paid,
        });
        Ok(())
    }

    // ───────────────────── Vault: withdraw ─────────────────────

    /// User or publisher pulls their accumulated balance to their own USDC ATA.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let ub = &mut ctx.accounts.user_balance;
        require!(ub.wallet == ctx.accounts.beneficiary.key(), VistaError::NotOwner);
        let amount = ub.balance;
        require!(amount > 0, VistaError::NothingToWithdraw);
        ub.balance = 0;

        let bump = ctx.accounts.config.vault_authority_bump;
        let seeds: &[&[u8]] = &[b"vault_authority", &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_vault.to_account_info(),
                    to: ctx.accounts.beneficiary_token.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(Withdrawn { wallet: ub.wallet, amount });
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
        space = 8 + Config::SIZE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub usdc_mint: Account<'info, Mint>,

    /// CHECK: PDA used as authority of the global user_vault token account.
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [b"user_vault"],
        bump,
    )]
    pub user_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        space = 8 + ReceiptCounter::SIZE,
        seeds = [b"receipt_counter"],
        bump,
    )]
    pub receipt_counter: Account<'info, ReceiptCounter>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ VistaError::NotAdmin,
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(campaign_id: [u8; 32])]
pub struct DepositCampaign<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = advertiser,
        space = 8 + Campaign::SIZE,
        seeds = [b"campaign", campaign_id.as_ref()],
        bump,
    )]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: PDA owning the campaign vault token account.
    #[account(seeds = [b"campaign_vault_authority", campaign_id.as_ref()], bump)]
    pub campaign_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = advertiser,
        token::mint = usdc_mint,
        token::authority = campaign_vault_authority,
        seeds = [b"campaign_vault", campaign_id.as_ref()],
        bump,
    )]
    pub campaign_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub advertiser_token: Account<'info, TokenAccount>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RefundCampaign<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,

    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: PDA owning campaign vault, validated by seeds.
    #[account(
        seeds = [b"campaign_vault_authority", campaign.campaign_id.as_ref()],
        bump = campaign.vault_authority_bump,
    )]
    pub campaign_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"campaign_vault", campaign.campaign_id.as_ref()],
        bump,
    )]
    pub campaign_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub advertiser_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32], campaign_id: [u8; 32])]
pub struct StartStream<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [b"campaign", campaign_id.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        init,
        payer = oracle,
        space = 8 + Session::SIZE,
        seeds = [b"session", session_id.as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,

    /// CHECK: end-user wallet. Stored as session participant; not signing.
    pub user_wallet: UncheckedAccount<'info>,
    /// CHECK: publisher wallet. Stored as session participant; not signing.
    pub publisher_wallet: UncheckedAccount<'info>,

    /// CHECK: PDA owning the per-session validator pool.
    #[account(seeds = [b"validator_pool_authority", session_id.as_ref()], bump)]
    pub validator_pool_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = oracle,
        token::mint = usdc_mint,
        token::authority = validator_pool_authority,
        seeds = [b"validator_pool", session_id.as_ref()],
        bump,
    )]
    pub validator_pool_vault: Account<'info, TokenAccount>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TickStream<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [b"session", session.session_id.as_ref()],
        bump = session.bump,
    )]
    pub session: Box<Account<'info, Session>>,

    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Box<Account<'info, Campaign>>,

    /// CHECK: PDA owning campaign vault.
    #[account(
        seeds = [b"campaign_vault_authority", campaign.campaign_id.as_ref()],
        bump = campaign.vault_authority_bump,
    )]
    pub campaign_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"campaign_vault", campaign.campaign_id.as_ref()],
        bump,
    )]
    pub campaign_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"user_vault"],
        bump,
        token::authority = vault_authority,
    )]
    pub user_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority of user_vault.
    #[account(seeds = [b"vault_authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = config.usdc_mint,
        constraint = vista_wallet_token.owner == config.vista_wallet @ VistaError::WrongVistaWallet,
    )]
    pub vista_wallet_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"validator_pool", session.session_id.as_ref()],
        bump,
        token::mint = config.usdc_mint,
    )]
    pub validator_pool_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + UserBalance::SIZE,
        seeds = [b"balance", session.user_wallet.as_ref()],
        bump,
    )]
    pub user_balance: Box<Account<'info, UserBalance>>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + UserBalance::SIZE,
        seeds = [b"balance", session.publisher_wallet.as_ref()],
        bump,
    )]
    pub publisher_balance: Box<Account<'info, UserBalance>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct DrainValidatorPool<'info> {
    /// CHECK: PDA derived from the attention_aggregator program; verified in
    /// the instruction handler against ATTENTION_AGGREGATOR_ID.
    pub aggregator_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"validator_pool", session_id.as_ref()],
        bump,
    )]
    pub validator_pool_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority that owns the validator_pool_vault.
    #[account(
        seeds = [b"validator_pool_authority", session_id.as_ref()],
        bump,
    )]
    pub validator_pool_authority: UncheckedAccount<'info>,

    /// CHECK: oracle_registry's reward vault (validated by mint match below).
    #[account(mut, token::mint = validator_pool_vault.mint)]
    pub reward_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EndStream<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"session", session.session_id.as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, Session>,

    #[account(
        seeds = [b"campaign", campaign.campaign_id.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        seeds = [b"receipt_counter"],
        bump = receipt_counter.bump,
    )]
    pub receipt_counter: Account<'info, ReceiptCounter>,

    #[account(
        init,
        payer = oracle,
        space = 8 + Receipt::SIZE,
        seeds = [b"receipt".as_ref(), receipt_counter.next_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, Receipt>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"balance", beneficiary.key().as_ref()],
        bump = user_balance.bump,
    )]
    pub user_balance: Account<'info, UserBalance>,

    #[account(
        mut,
        seeds = [b"user_vault"],
        bump,
        token::authority = vault_authority,
    )]
    pub user_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority of user_vault.
    #[account(seeds = [b"vault_authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = config.usdc_mint,
        token::authority = beneficiary,
    )]
    pub beneficiary_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────── State ───────────────────────────────

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub oracle: Pubkey,
    pub vista_wallet: Pubkey,
    pub bump: u8,
    pub vault_authority_bump: u8,
}
impl Config {
    pub const SIZE: usize = 32 * 4 + 1 + 1;
}

#[account]
pub struct Campaign {
    pub campaign_id: [u8; 32],
    pub advertiser: Pubkey,
    pub total_budget: u64,
    pub remaining_budget: u64,
    pub rate_per_second: u64,
    pub duration: u64,
    pub active: bool,
    pub created_at: i64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}
impl Campaign {
    pub const SIZE: usize = 32 + 32 + 8 * 4 + 1 + 8 + 1 + 1;
}

#[account]
pub struct Session {
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
    pub user_wallet: Pubkey,
    pub publisher_wallet: Pubkey,
    pub seconds_verified: u64,
    pub total_paid: u64,
    pub active: bool,
    pub started_at: i64,
    pub bump: u8,
}
impl Session {
    pub const SIZE: usize = 32 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

#[account]
pub struct UserBalance {
    pub wallet: Pubkey,
    pub balance: u64,
    pub bump: u8,
}
impl UserBalance {
    pub const SIZE: usize = 32 + 8 + 1;
}

#[account]
pub struct Receipt {
    pub token_id: u64,
    pub session_id: [u8; 32],
    pub user_wallet: Pubkey,
    pub advertiser: Pubkey,
    pub campaign_id: [u8; 32],
    pub publisher_wallet: Pubkey,
    pub seconds_verified: u64,
    pub usdc_paid: u64,
    pub timestamp: i64,
    pub bump: u8,
}
impl Receipt {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct ReceiptCounter {
    pub next_id: u64,
    pub bump: u8,
}
impl ReceiptCounter {
    pub const SIZE: usize = 8 + 1;
}

// ─────────────────────────────── Events ───────────────────────────────

#[event]
pub struct CampaignCreated {
    pub campaign_id: [u8; 32],
    pub advertiser: Pubkey,
    pub amount: u64,
    pub rate_per_second: u64,
}

#[event]
pub struct CampaignEnded {
    pub campaign_id: [u8; 32],
    pub refunded_amount: u64,
}

#[event]
pub struct StreamStarted {
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
    pub user_wallet: Pubkey,
    pub publisher_wallet: Pubkey,
}

#[event]
pub struct StreamTick {
    pub session_id: [u8; 32],
    pub user_wallet: Pubkey,
    pub publisher_wallet: Pubkey,
    pub total_amount: u64,
    pub user_amount: u64,
    pub publisher_amount: u64,
    pub validator_amount: u64,
    pub vista_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct StreamEnded {
    pub session_id: [u8; 32],
    pub seconds_verified: u64,
    pub total_paid: u64,
}

#[event]
pub struct ReceiptMinted {
    pub user: Pubkey,
    pub token_id: u64,
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
    pub seconds_verified: u64,
    pub usdc_paid: u64,
}

#[event]
pub struct Credited {
    pub wallet: Pubkey,
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
    pub amount: u64,
    pub role: u8, // 0 = user, 1 = publisher
}

#[event]
pub struct Withdrawn {
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OracleSet {
    pub oracle: Pubkey,
}

#[event]
pub struct VistaWalletSet {
    pub vista_wallet: Pubkey,
}

#[event]
pub struct ValidatorPoolDrained {
    pub session_id: [u8; 32],
    pub amount: u64,
    pub reward_vault: Pubkey,
}

// ─────────────────────────────── Errors ───────────────────────────────

#[error_code]
pub enum VistaError {
    #[msg("Zero address provided")]
    ZeroAddress,
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Rate must be > 0")]
    ZeroRate,
    #[msg("Duration must be > 0")]
    ZeroDuration,
    #[msg("Seconds elapsed must be > 0")]
    ZeroSeconds,
    #[msg("Caller is not the admin")]
    NotAdmin,
    #[msg("Caller is not the oracle")]
    NotOracle,
    #[msg("Caller is not the campaign advertiser")]
    NotAdvertiser,
    #[msg("Caller is not the balance owner")]
    NotOwner,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Campaign budget exhausted")]
    CampaignExhausted,
    #[msg("Campaign id does not match")]
    CampaignMismatch,
    #[msg("Session is not active")]
    SessionNotActive,
    #[msg("Insufficient remaining budget")]
    InsufficientBudget,
    #[msg("Nothing to refund")]
    NothingToRefund,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Vista wallet token account owner mismatch")]
    WrongVistaWallet,
    #[msg("Caller is not the attention_aggregator program signer")]
    NotAggregator,
    #[msg("Validator pool is empty — nothing to drain")]
    EmptyPool,
    #[msg("Arithmetic overflow")]
    Overflow,
}
