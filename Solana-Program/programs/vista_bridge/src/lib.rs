use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE");

// Same canonical USDC mint as vista_protocol on devnet. Cross-chain campaigns
// receive native USDC minted by Circle CCTP into a per-campaign vault PDA owned
// by this program; tick payouts then move that USDC into vista_protocol's
// shared user_vault token account (which is *also* USDC, so no mint mismatch).
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Mirror vista_protocol's revenue split exactly. Keeping these in sync is
// load-bearing — if vista_protocol changes its split, this must follow.
const USER_PCT: u64 = 30;
const PUBLISHER_PCT: u64 = 50;
const VALIDATOR_PCT: u64 = 10;

#[program]
pub mod vista_bridge {
    use super::*;

    // ─────────────────────────── Admin ───────────────────────────

    /// One-time bridge initialization. `lz_executor_authority` is the key that
    /// the LayerZero executor PDA will eventually be — for the hackathon
    /// trusted-relayer mode this is just the oracle-node admin key.
    pub fn initialize_bridge(
        ctx: Context<InitializeBridge>,
        oracle: Pubkey,
        vista_wallet: Pubkey,
        lz_executor_authority: Pubkey,
    ) -> Result<()> {
        require!(oracle != Pubkey::default(), BridgeError::ZeroAddress);
        require!(vista_wallet != Pubkey::default(), BridgeError::ZeroAddress);
        require!(
            lz_executor_authority != Pubkey::default(),
            BridgeError::ZeroAddress
        );

        let cfg = &mut ctx.accounts.bridge_config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.usdc_mint = ctx.accounts.usdc_mint.key();
        cfg.oracle = oracle;
        cfg.vista_wallet = vista_wallet;
        cfg.lz_executor_authority = lz_executor_authority;
        cfg.bump = ctx.bumps.bridge_config;

        emit!(BridgeInitialized {
            admin: cfg.admin,
            oracle,
            vista_wallet,
            lz_executor_authority,
        });
        Ok(())
    }

    // ──────────────── Cross-chain receive (LayerZero stub) ────────────────

    /// Receives campaign metadata bridged from an EVM `VistaGateway` via
    /// LayerZero. Today gated by `lz_executor_authority` (= oracle relayer);
    /// flipping to the real LZ V2 executor PDA later is one constraint change.
    /// USDC has not arrived yet at this point — `confirm_usdc_received` flips
    /// `is_active` once the per-campaign vault holds the expected balance.
    pub fn receive_campaign_metadata(
        ctx: Context<ReceiveCampaignMetadata>,
        campaign_id: [u8; 32],
        advertiser_evm: [u8; 20],
        source_chain_eid: u32,
        total_budget: u64,
        rate_per_second: u64,
        duration: u64,
        cctp_nonce: u64,
    ) -> Result<()> {
        require!(total_budget > 0, BridgeError::ZeroAmount);
        require!(rate_per_second > 0, BridgeError::ZeroRate);
        require!(duration > 0, BridgeError::ZeroDuration);
        require!(
            ctx.accounts.lz_executor_authority.key()
                == ctx.accounts.bridge_config.lz_executor_authority,
            BridgeError::NotLzExecutor
        );

        let c = &mut ctx.accounts.cross_chain_campaign;
        c.campaign_id = campaign_id;
        c.advertiser_evm = advertiser_evm;
        c.advertiser_solana = ctx.accounts.advertiser_solana.key();
        c.source_chain_eid = source_chain_eid;
        c.total_budget = total_budget;
        c.remaining_budget = total_budget;
        c.rate_per_second = rate_per_second;
        c.duration = duration;
        c.cctp_nonce = cctp_nonce;
        c.usdc_confirmed = false;
        c.is_active = false;
        c.created_at = Clock::get()?.unix_timestamp;
        c.bump = ctx.bumps.cross_chain_campaign;
        c.vault_authority_bump = ctx.bumps.xchain_vault_authority;

        emit!(CrossChainCampaignReceived {
            campaign_id,
            advertiser_evm,
            advertiser_solana: c.advertiser_solana,
            source_chain_eid,
            total_budget,
            cctp_nonce,
            timestamp: c.created_at,
        });
        Ok(())
    }

    /// Permissionless: anyone can call this once Circle CCTP has minted the
    /// expected USDC into the per-campaign vault. The check is purely a
    /// balance comparison — the per-campaign vault PDA can only receive USDC
    /// from a CCTP `receive_message` whose `mintRecipient` matches its address.
    pub fn confirm_usdc_received(ctx: Context<ConfirmUsdcReceived>) -> Result<()> {
        let c = &mut ctx.accounts.cross_chain_campaign;
        require!(!c.usdc_confirmed, BridgeError::AlreadyConfirmed);
        require!(
            ctx.accounts.xchain_vault.amount >= c.total_budget,
            BridgeError::InsufficientUsdcReceived
        );

        c.usdc_confirmed = true;
        c.is_active = true;

        emit!(CrossChainCampaignActivated {
            campaign_id: c.campaign_id,
            total_budget: c.total_budget,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // ──────────────────── Stream: oracle settlement ────────────────────

    pub fn start_cross_chain_stream(
        ctx: Context<StartCrossChainStream>,
        session_id: [u8; 32],
        campaign_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.oracle.key() == ctx.accounts.bridge_config.oracle,
            BridgeError::NotOracle
        );
        let c = &ctx.accounts.cross_chain_campaign;
        require!(c.campaign_id == campaign_id, BridgeError::CampaignMismatch);
        require!(c.is_active, BridgeError::CampaignNotActive);

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

        emit!(CrossChainStreamStarted {
            session_id,
            campaign_id,
            user_wallet: s.user_wallet,
            publisher_wallet: s.publisher_wallet,
        });
        Ok(())
    }

    /// Oracle credits attention seconds. Splits the per-second rate the same
    /// way vista_protocol does (30/50/10/10) and pays out:
    ///   - user portion → user's USDC ATA directly (cross-chain users withdraw
    ///     in one step — no parallel vault account on this side)
    ///   - publisher portion → publisher USDC ATA directly
    ///   - validator portion → bridge_validator_pool (drained out-of-band by
    ///     the existing oracle_registry path; matched layout)
    ///   - vista fee → vista_wallet's USDC ATA
    /// `BridgeUserBalance` is updated as a *book-keeping* record only; the
    /// actual USDC has already moved. The dashboard reads this for "how much
    /// has this user earned from cross-chain campaigns".
    pub fn tick_cross_chain(ctx: Context<TickCrossChain>, seconds_elapsed: u64) -> Result<()> {
        require!(
            ctx.accounts.oracle.key() == ctx.accounts.bridge_config.oracle,
            BridgeError::NotOracle
        );
        require!(seconds_elapsed > 0, BridgeError::ZeroSeconds);

        let session = &mut ctx.accounts.session;
        require!(session.active, BridgeError::SessionNotActive);

        let campaign = &mut ctx.accounts.cross_chain_campaign;
        require!(
            campaign.campaign_id == session.campaign_id,
            BridgeError::CampaignMismatch
        );
        require!(campaign.is_active, BridgeError::CampaignExhausted);

        let total_amount = campaign
            .rate_per_second
            .checked_mul(seconds_elapsed)
            .ok_or(BridgeError::Overflow)?;
        require!(
            campaign.remaining_budget >= total_amount,
            BridgeError::InsufficientBudget
        );

        let user_amount = total_amount
            .checked_mul(USER_PCT)
            .ok_or(BridgeError::Overflow)?
            / 100;
        let publisher_amount = total_amount
            .checked_mul(PUBLISHER_PCT)
            .ok_or(BridgeError::Overflow)?
            / 100;
        let validator_amount = total_amount
            .checked_mul(VALIDATOR_PCT)
            .ok_or(BridgeError::Overflow)?
            / 100;
        let vista_amount = total_amount - user_amount - publisher_amount - validator_amount;

        let campaign_id = campaign.campaign_id;
        let cv_bump = campaign.vault_authority_bump;
        let cv_seeds: &[&[u8]] = &[b"xchain_vault_authority", campaign_id.as_ref(), &[cv_bump]];
        let signer_seeds = &[cv_seeds];

        // user → user_token (their ATA)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.xchain_vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.xchain_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            user_amount,
        )?;

        // publisher → publisher_token (their ATA)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.xchain_vault.to_account_info(),
                    to: ctx.accounts.publisher_token.to_account_info(),
                    authority: ctx.accounts.xchain_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            publisher_amount,
        )?;

        // validator pool (oracle_registry drains this asynchronously)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.xchain_vault.to_account_info(),
                    to: ctx.accounts.validator_pool.to_account_info(),
                    authority: ctx.accounts.xchain_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            validator_amount,
        )?;

        // vista fee
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.xchain_vault.to_account_info(),
                    to: ctx.accounts.vista_wallet_token.to_account_info(),
                    authority: ctx.accounts.xchain_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            vista_amount,
        )?;

        campaign.remaining_budget -= total_amount;
        if campaign.remaining_budget == 0 {
            campaign.is_active = false;
        }

        let ub = &mut ctx.accounts.user_balance;
        ub.wallet = session.user_wallet;
        ub.lifetime_earned = ub
            .lifetime_earned
            .checked_add(user_amount)
            .ok_or(BridgeError::Overflow)?;
        ub.bump = ctx.bumps.user_balance;

        let pb = &mut ctx.accounts.publisher_balance;
        pb.wallet = session.publisher_wallet;
        pb.lifetime_earned = pb
            .lifetime_earned
            .checked_add(publisher_amount)
            .ok_or(BridgeError::Overflow)?;
        pb.bump = ctx.bumps.publisher_balance;

        session.seconds_verified += seconds_elapsed;
        session.total_paid += total_amount;

        emit!(CrossChainStreamTick {
            session_id: session.session_id,
            campaign_id: session.campaign_id,
            user_wallet: session.user_wallet,
            publisher_wallet: session.publisher_wallet,
            total_amount,
            user_amount,
            publisher_amount,
            validator_amount,
            vista_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn end_cross_chain_stream(ctx: Context<EndCrossChainStream>) -> Result<()> {
        require!(
            ctx.accounts.oracle.key() == ctx.accounts.bridge_config.oracle,
            BridgeError::NotOracle
        );
        let s = &mut ctx.accounts.session;
        require!(s.active, BridgeError::SessionNotActive);
        s.active = false;

        emit!(CrossChainStreamEnded {
            session_id: s.session_id,
            seconds_verified: s.seconds_verified,
            total_paid: s.total_paid,
        });
        Ok(())
    }

    // ───────────────────── Refund (admin-gated) ─────────────────────

    /// Admin can refund a cross-chain campaign's remaining budget back to a
    /// recipient ATA. For the hackathon this is admin-only; production should
    /// require an EVM signature from the original `advertiser_evm` recovered
    /// via the secp256k1 sysvar.
    pub fn refund_cross_chain(ctx: Context<RefundCrossChain>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.bridge_config.admin,
            BridgeError::NotAdmin
        );

        let c = &mut ctx.accounts.cross_chain_campaign;
        require!(c.is_active, BridgeError::CampaignNotActive);
        let refund = c.remaining_budget;
        require!(refund > 0, BridgeError::NothingToRefund);

        c.remaining_budget = 0;
        c.is_active = false;

        let campaign_id = c.campaign_id;
        let bump = c.vault_authority_bump;
        let seeds: &[&[u8]] = &[b"xchain_vault_authority", campaign_id.as_ref(), &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.xchain_vault.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(),
                    authority: ctx.accounts.xchain_vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            refund,
        )?;

        emit!(CrossChainCampaignRefunded {
            campaign_id,
            amount: refund,
        });
        Ok(())
    }
}

// ─────────────────────────── Accounts ───────────────────────────

#[derive(Accounts)]
pub struct InitializeBridge<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + BridgeConfig::SIZE,
        seeds = [b"bridge_config"],
        bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(campaign_id: [u8; 32])]
pub struct ReceiveCampaignMetadata<'info> {
    /// Pays for account creation. In trusted-relayer mode, oracle-node pays.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Authorizes the receive. In stub mode = oracle-node admin key; later
    /// will be the LayerZero V2 executor PDA. Verified against bridge_config.
    pub lz_executor_authority: Signer<'info>,

    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// CHECK: Solana-side wallet the EVM advertiser links. Stored on the
    /// CrossChainCampaign so the dashboard can attribute to the right user.
    pub advertiser_solana: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + CrossChainCampaign::SIZE,
        seeds = [b"xchain_campaign", campaign_id.as_ref()],
        bump,
    )]
    pub cross_chain_campaign: Account<'info, CrossChainCampaign>,

    /// CHECK: PDA owning the per-campaign USDC vault.
    #[account(seeds = [b"xchain_vault_authority", campaign_id.as_ref()], bump)]
    pub xchain_vault_authority: UncheckedAccount<'info>,

    /// Per-campaign USDC vault. Created here so CCTP can mint into it next.
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = xchain_vault_authority,
        seeds = [b"xchain_vault", campaign_id.as_ref()],
        bump,
    )]
    pub xchain_vault: Account<'info, TokenAccount>,

    #[account(address = bridge_config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ConfirmUsdcReceived<'info> {
    /// Permissionless — anyone (typically oracle-node after CCTP attestation)
    /// can flip is_active once the vault holds the expected balance.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"xchain_campaign", cross_chain_campaign.campaign_id.as_ref()],
        bump = cross_chain_campaign.bump,
    )]
    pub cross_chain_campaign: Account<'info, CrossChainCampaign>,

    #[account(
        seeds = [b"xchain_vault", cross_chain_campaign.campaign_id.as_ref()],
        bump,
    )]
    pub xchain_vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32], campaign_id: [u8; 32])]
pub struct StartCrossChainStream<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        seeds = [b"xchain_campaign", campaign_id.as_ref()],
        bump = cross_chain_campaign.bump,
    )]
    pub cross_chain_campaign: Account<'info, CrossChainCampaign>,

    #[account(
        init,
        payer = oracle,
        space = 8 + CrossChainSession::SIZE,
        seeds = [b"xchain_session", session_id.as_ref()],
        bump,
    )]
    pub session: Account<'info, CrossChainSession>,

    /// CHECK: end-user wallet. Stored, not signing.
    pub user_wallet: UncheckedAccount<'info>,
    /// CHECK: publisher wallet. Stored, not signing.
    pub publisher_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TickCrossChain<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Box<Account<'info, BridgeConfig>>,

    #[account(
        mut,
        seeds = [b"xchain_session", session.session_id.as_ref()],
        bump = session.bump,
    )]
    pub session: Box<Account<'info, CrossChainSession>>,

    #[account(
        mut,
        seeds = [b"xchain_campaign", cross_chain_campaign.campaign_id.as_ref()],
        bump = cross_chain_campaign.bump,
    )]
    pub cross_chain_campaign: Box<Account<'info, CrossChainCampaign>>,

    /// CHECK: PDA owning campaign vault.
    #[account(
        seeds = [b"xchain_vault_authority", cross_chain_campaign.campaign_id.as_ref()],
        bump = cross_chain_campaign.vault_authority_bump,
    )]
    pub xchain_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"xchain_vault", cross_chain_campaign.campaign_id.as_ref()],
        bump,
    )]
    pub xchain_vault: Box<Account<'info, TokenAccount>>,

    /// User's USDC ATA — receives the user portion directly.
    #[account(
        mut,
        token::mint = bridge_config.usdc_mint,
        constraint = user_token.owner == session.user_wallet @ BridgeError::WrongRecipient,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,

    /// Publisher's USDC ATA — receives the publisher portion directly.
    #[account(
        mut,
        token::mint = bridge_config.usdc_mint,
        constraint = publisher_token.owner == session.publisher_wallet @ BridgeError::WrongRecipient,
    )]
    pub publisher_token: Box<Account<'info, TokenAccount>>,

    /// Validator-rewards pool token account. Drained by oracle_registry.
    /// Validated by mint only — caller passes the right one.
    #[account(mut, token::mint = bridge_config.usdc_mint)]
    pub validator_pool: Box<Account<'info, TokenAccount>>,

    /// VISTA fee recipient.
    #[account(
        mut,
        token::mint = bridge_config.usdc_mint,
        constraint = vista_wallet_token.owner == bridge_config.vista_wallet @ BridgeError::WrongVistaWallet,
    )]
    pub vista_wallet_token: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + BridgeUserBalance::SIZE,
        seeds = [b"bridge_balance", session.user_wallet.as_ref()],
        bump,
    )]
    pub user_balance: Box<Account<'info, BridgeUserBalance>>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + BridgeUserBalance::SIZE,
        seeds = [b"bridge_balance", session.publisher_wallet.as_ref()],
        bump,
    )]
    pub publisher_balance: Box<Account<'info, BridgeUserBalance>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct EndCrossChainStream<'info> {
    pub oracle: Signer<'info>,

    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        mut,
        seeds = [b"xchain_session", session.session_id.as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, CrossChainSession>,
}

#[derive(Accounts)]
pub struct RefundCrossChain<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        mut,
        seeds = [b"xchain_campaign", cross_chain_campaign.campaign_id.as_ref()],
        bump = cross_chain_campaign.bump,
    )]
    pub cross_chain_campaign: Account<'info, CrossChainCampaign>,

    /// CHECK: PDA owning the campaign vault.
    #[account(
        seeds = [b"xchain_vault_authority", cross_chain_campaign.campaign_id.as_ref()],
        bump = cross_chain_campaign.vault_authority_bump,
    )]
    pub xchain_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"xchain_vault", cross_chain_campaign.campaign_id.as_ref()],
        bump,
    )]
    pub xchain_vault: Account<'info, TokenAccount>,

    #[account(mut, token::mint = bridge_config.usdc_mint)]
    pub recipient_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────── State ───────────────────────────

#[account]
pub struct BridgeConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub oracle: Pubkey,
    pub vista_wallet: Pubkey,
    pub lz_executor_authority: Pubkey,
    pub bump: u8,
}
impl BridgeConfig {
    pub const SIZE: usize = 32 * 5 + 1;
}

#[account]
pub struct CrossChainCampaign {
    pub campaign_id: [u8; 32],
    pub advertiser_evm: [u8; 20],
    pub advertiser_solana: Pubkey,
    pub source_chain_eid: u32,
    pub total_budget: u64,
    pub remaining_budget: u64,
    pub rate_per_second: u64,
    pub duration: u64,
    pub cctp_nonce: u64,
    pub usdc_confirmed: bool,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}
impl CrossChainCampaign {
    pub const SIZE: usize =
        32 + 20 + 32 + 4 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1 + 1;
}

#[account]
pub struct CrossChainSession {
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
impl CrossChainSession {
    pub const SIZE: usize = 32 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

#[account]
pub struct BridgeUserBalance {
    pub wallet: Pubkey,
    pub lifetime_earned: u64,
    pub bump: u8,
}
impl BridgeUserBalance {
    pub const SIZE: usize = 32 + 8 + 1;
}

// ─────────────────────────── Events ───────────────────────────

#[event]
pub struct BridgeInitialized {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub vista_wallet: Pubkey,
    pub lz_executor_authority: Pubkey,
}

#[event]
pub struct CrossChainCampaignReceived {
    pub campaign_id: [u8; 32],
    pub advertiser_evm: [u8; 20],
    pub advertiser_solana: Pubkey,
    pub source_chain_eid: u32,
    pub total_budget: u64,
    pub cctp_nonce: u64,
    pub timestamp: i64,
}

#[event]
pub struct CrossChainCampaignActivated {
    pub campaign_id: [u8; 32],
    pub total_budget: u64,
    pub timestamp: i64,
}

#[event]
pub struct CrossChainStreamStarted {
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
    pub user_wallet: Pubkey,
    pub publisher_wallet: Pubkey,
}

#[event]
pub struct CrossChainStreamTick {
    pub session_id: [u8; 32],
    pub campaign_id: [u8; 32],
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
pub struct CrossChainStreamEnded {
    pub session_id: [u8; 32],
    pub seconds_verified: u64,
    pub total_paid: u64,
}

#[event]
pub struct CrossChainCampaignRefunded {
    pub campaign_id: [u8; 32],
    pub amount: u64,
}

// ─────────────────────────── Errors ───────────────────────────

#[error_code]
pub enum BridgeError {
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
    #[msg("Caller is not the LZ executor authority")]
    NotLzExecutor,
    #[msg("USDC has already been confirmed for this campaign")]
    AlreadyConfirmed,
    #[msg("Per-campaign vault holds less USDC than the expected total budget")]
    InsufficientUsdcReceived,
    #[msg("Cross-chain campaign is not active")]
    CampaignNotActive,
    #[msg("Cross-chain campaign budget exhausted")]
    CampaignExhausted,
    #[msg("Campaign id mismatch")]
    CampaignMismatch,
    #[msg("Session is not active")]
    SessionNotActive,
    #[msg("Insufficient remaining budget")]
    InsufficientBudget,
    #[msg("Recipient token account owner does not match expected wallet")]
    WrongRecipient,
    #[msg("Vista wallet token account owner mismatch")]
    WrongVistaWallet,
    #[msg("Nothing left to refund")]
    NothingToRefund,
    #[msg("Arithmetic overflow")]
    Overflow,
}
