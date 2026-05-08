use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use oracle_registry::{OracleNode, Registry};

declare_id!("6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH");

const MAX_SUBMISSIONS: usize = 16;

// Anchor instruction discriminators (sha256("global:<name>")[..8]).
const DISC_SLASH_ORACLE: [u8; 8] = [69, 85, 18, 20, 205, 99, 149, 145];
const DISC_CREDIT_REWARD: [u8; 8] = [46, 66, 65, 169, 234, 253, 134, 14];
const DISC_DRAIN_VALIDATOR_POOL: [u8; 8] = [122, 162, 249, 101, 32, 23, 33, 59];

#[program]
pub mod attention_aggregator {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        vista_protocol: Pubkey,
        oracle_registry: Pubkey,
        min_quorum: u8,
        deviation_bps: u16,
        window_seconds: i64,
    ) -> Result<()> {
        require!(min_quorum >= 2, AggregatorError::QuorumTooLow);
        require!(deviation_bps <= 10_000, AggregatorError::InvalidDeviation);
        require!(window_seconds > 0, AggregatorError::InvalidWindow);

        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.vista_protocol = vista_protocol;
        cfg.oracle_registry = oracle_registry;
        cfg.min_quorum = min_quorum;
        cfg.deviation_bps = deviation_bps;
        cfg.window_seconds = window_seconds;
        cfg.bump = ctx.bumps.config;
        cfg.signer_bump = ctx.bumps.aggregator_signer;
        Ok(())
    }

    pub fn submit_verification(
        ctx: Context<SubmitVerification>,
        session_id: [u8; 32],
        score: u8,
    ) -> Result<()> {
        require!(score <= 100, AggregatorError::InvalidScore);

        // Defense-in-depth: verify the OracleNode is currently active and meets
        // min_stake. The seeds::program constraint on `oracle_node` already binds
        // the account to this signer's pubkey via the canonical PDA derivation,
        // so reading `active`/`stake` here is reading *this* signer's record.
        let (stake, active) = read_oracle_node_stake_active(&ctx.accounts.oracle_node)?;
        require!(active, AggregatorError::OracleNotActive);
        let min_stake = read_registry_min_stake(&ctx.accounts.registry)?;
        require!(stake >= min_stake, AggregatorError::InsufficientStake);

        let now = Clock::get()?.unix_timestamp;
        let cfg = &ctx.accounts.config;
        let session = &mut ctx.accounts.attention_session;

        // First submission initializes the session record.
        if session.submissions_count == 0 {
            session.session_id = session_id;
            session.window_start = now;
            session.bump = ctx.bumps.attention_session;
        } else {
            require!(
                session.session_id == session_id,
                AggregatorError::SessionMismatch
            );
            require!(!session.is_settled, AggregatorError::AlreadySettled);
            require!(
                now - session.window_start <= cfg.window_seconds,
                AggregatorError::WindowExpired
            );
        }

        // Reject duplicate submissions from the same oracle.
        let oracle_key = ctx.accounts.oracle.key();
        for i in 0..(session.submissions_count as usize) {
            require!(
                session.submissions[i].oracle != oracle_key,
                AggregatorError::AlreadySubmitted
            );
        }

        require!(
            (session.submissions_count as usize) < MAX_SUBMISSIONS,
            AggregatorError::MaxSubmissionsReached
        );

        let idx = session.submissions_count as usize;
        session.submissions[idx] = OracleSubmission {
            oracle: oracle_key,
            score,
            submitted_at: now,
            is_outlier: false,
        };
        session.submissions_count += 1;

        emit!(VerificationSubmitted {
            session_id,
            oracle: oracle_key,
            score,
            timestamp: now,
        });
        Ok(())
    }

    /// Permissionless. Closes the submission window, finds outliers (deviation
    /// > deviation_bps from mean), and CPIs into:
    ///   - oracle_registry::slash_oracle for each outlier
    ///   - vista_protocol::drain_validator_pool to move validator pool USDC
    ///     into the registry's RewardVault
    ///   - oracle_registry::credit_reward for each honest oracle (split equally)
    ///
    /// remaining_accounts layout:
    ///   [oracle_node_0, oracle_node_1, ...] in the SAME ORDER as
    ///   `attention_session.submissions[0..submissions_count]`.
    pub fn aggregate_results<'info>(
        ctx: Context<'info, AggregateResults<'info>>,
        session_id: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let session = &mut ctx.accounts.attention_session;
        require!(!session.is_settled, AggregatorError::AlreadySettled);
        require!(
            session.session_id == session_id,
            AggregatorError::SessionMismatch
        );

        let now = Clock::get()?.unix_timestamp;
        let window_expired = now - session.window_start >= cfg.window_seconds;
        let quorum_reached = session.submissions_count >= cfg.min_quorum;
        require!(
            window_expired || quorum_reached,
            AggregatorError::NotReadyToAggregate
        );

        let count = session.submissions_count as usize;
        require!(count >= 2, AggregatorError::InsufficientSubmissions);
        require!(
            ctx.remaining_accounts.len() == count,
            AggregatorError::RemainingAccountsMismatch
        );

        // SECURITY (C1): bind each remaining_accounts[i] to submissions[i].oracle.
        // Without this check, a permissionless caller of aggregate_results could
        // pass arbitrary OracleNode PDAs and route slashing/credit to the wrong
        // oracles (slash innocents, credit attacker's nodes).
        for i in 0..count {
            let (expected, _bump) = Pubkey::find_program_address(
                &[b"oracle_node", session.submissions[i].oracle.as_ref()],
                &cfg.oracle_registry,
            );
            require_keys_eq!(
                ctx.remaining_accounts[i].key(),
                expected,
                AggregatorError::OracleNodeBindingMismatch
            );
        }

        // Compute mean of all submitted scores.
        let mut sum: u32 = 0;
        for i in 0..count {
            sum += session.submissions[i].score as u32;
        }
        let mean = (sum / count as u32) as u32;

        // Mark outliers using deviation_bps. deviation = |score - mean| / mean.
        // Express as basis points: deviation_bps_actual = |s-m|*10000 / m.
        let mut honest_indices: Vec<usize> = Vec::with_capacity(count);
        let mut outlier_indices: Vec<usize> = Vec::with_capacity(count);
        for i in 0..count {
            let score = session.submissions[i].score as i64;
            let diff = (score - mean as i64).unsigned_abs();
            let bps = if mean == 0 {
                10_000
            } else {
                ((diff as u128) * 10_000 / mean as u128) as u32
            };
            if bps > cfg.deviation_bps as u32 {
                session.submissions[i].is_outlier = true;
                outlier_indices.push(i);
            } else {
                honest_indices.push(i);
            }
        }

        // Compute consensus_score = mean of honest scores (or 0 if none).
        let consensus = if honest_indices.is_empty() {
            0
        } else {
            let mut hs: u32 = 0;
            for &i in &honest_indices {
                hs += session.submissions[i].score as u32;
            }
            (hs / honest_indices.len() as u32) as u8
        };
        session.consensus_score = consensus;
        session.consensus_reached = consensus >= 60;

        // ── 1. Slash outliers ──
        let signer_bump = cfg.signer_bump;
        let signer_seeds: &[&[u8]] = &[b"aggregator_signer", &[signer_bump]];

        for &i in &outlier_indices {
            let oracle_node_info = ctx.remaining_accounts[i].clone();
            let stake = read_oracle_stake(&oracle_node_info)?;
            let slash_amount = stake / 10; // 10% of current stake
            if slash_amount == 0 {
                continue;
            }

            cpi_slash_oracle(
                &ctx.accounts.oracle_registry_program,
                &ctx.accounts.aggregator_signer,
                &ctx.accounts.registry,
                &oracle_node_info,
                slash_amount,
                signer_seeds,
            )?;

            emit!(OutlierDetected {
                session_id,
                oracle: session.submissions[i].oracle,
                score: session.submissions[i].score,
                consensus,
                slashed_amount: slash_amount,
            });
        }

        // ── 2. Drain validator pool into reward_vault ──
        let drained = cpi_drain_validator_pool(
            &ctx.accounts.vista_protocol_program,
            &ctx.accounts.aggregator_signer,
            &ctx.accounts.validator_pool_vault,
            &ctx.accounts.validator_pool_authority,
            &ctx.accounts.reward_vault,
            &ctx.accounts.token_program,
            session_id,
            signer_seeds,
        )?;

        // ── 3. Credit honest oracles equally ──
        let honest_count = honest_indices.len() as u64;
        if honest_count > 0 && drained > 0 {
            let per_oracle = drained / honest_count;
            if per_oracle > 0 {
                for &i in &honest_indices {
                    let oracle_node_info = ctx.remaining_accounts[i].clone();
                    cpi_credit_reward(
                        &ctx.accounts.oracle_registry_program,
                        &ctx.accounts.aggregator_signer,
                        &ctx.accounts.registry,
                        &oracle_node_info,
                        per_oracle,
                        session_id,
                        signer_seeds,
                    )?;
                }
            }
        }

        session.is_settled = true;
        session.settled_at = now;

        emit!(SessionAggregated {
            session_id,
            consensus_score: consensus,
            consensus_reached: session.consensus_reached,
            honest_count: honest_count as u8,
            slashed_count: outlier_indices.len() as u8,
            per_oracle_reward: if honest_count > 0 {
                drained / honest_count
            } else {
                0
            },
            settled_at: now,
        });
        Ok(())
    }
}

// ─────────────────────── CPI helpers (manual invoke_signed) ───────────────────────

/// Deserialize OracleNode using oracle_registry's canonical types (via the
/// `cpi` feature). This replaces previous byte-walking helpers that broke
/// silently if the OracleNode struct grew new fields.
fn deserialize_oracle_node(oracle_node_info: &AccountInfo) -> Result<OracleNode> {
    let data = oracle_node_info.try_borrow_data()?;
    OracleNode::try_deserialize(&mut &data[..])
        .map_err(|_| error!(AggregatorError::OracleNodeMalformed))
}

fn read_oracle_stake(oracle_node_info: &AccountInfo) -> Result<u64> {
    Ok(deserialize_oracle_node(oracle_node_info)?.stake)
}

fn read_oracle_node_stake_active(oracle_node_info: &AccountInfo) -> Result<(u64, bool)> {
    let node = deserialize_oracle_node(oracle_node_info)?;
    Ok((node.stake, node.active))
}

fn read_registry_min_stake(registry_info: &AccountInfo) -> Result<u64> {
    let data = registry_info.try_borrow_data()?;
    let reg = Registry::try_deserialize(&mut &data[..])
        .map_err(|_| error!(AggregatorError::RegistryMalformed))?;
    Ok(reg.min_stake)
}

#[allow(clippy::too_many_arguments)]
fn cpi_slash_oracle<'info>(
    program: &AccountInfo<'info>,
    aggregator_signer: &AccountInfo<'info>,
    registry: &AccountInfo<'info>,
    oracle_node: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&DISC_SLASH_ORACLE);
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: *program.key,
        accounts: vec![
            AccountMeta::new_readonly(*aggregator_signer.key, true),
            AccountMeta::new_readonly(*registry.key, false),
            AccountMeta::new(*oracle_node.key, false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            aggregator_signer.clone(),
            registry.clone(),
            oracle_node.clone(),
            program.clone(),
        ],
        &[signer_seeds],
    )?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cpi_credit_reward<'info>(
    program: &AccountInfo<'info>,
    aggregator_signer: &AccountInfo<'info>,
    registry: &AccountInfo<'info>,
    oracle_node: &AccountInfo<'info>,
    amount: u64,
    session_id: [u8; 32],
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8 + 32);
    data.extend_from_slice(&DISC_CREDIT_REWARD);
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&session_id);

    let ix = Instruction {
        program_id: *program.key,
        accounts: vec![
            AccountMeta::new_readonly(*aggregator_signer.key, true),
            AccountMeta::new_readonly(*registry.key, false),
            AccountMeta::new(*oracle_node.key, false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            aggregator_signer.clone(),
            registry.clone(),
            oracle_node.clone(),
            program.clone(),
        ],
        &[signer_seeds],
    )?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cpi_drain_validator_pool<'info>(
    program: &AccountInfo<'info>,
    aggregator_signer: &AccountInfo<'info>,
    validator_pool_vault: &AccountInfo<'info>,
    validator_pool_authority: &AccountInfo<'info>,
    reward_vault: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    session_id: [u8; 32],
    signer_seeds: &[&[u8]],
) -> Result<u64> {
    let mut data = Vec::with_capacity(8 + 32);
    data.extend_from_slice(&DISC_DRAIN_VALIDATOR_POOL);
    data.extend_from_slice(&session_id);

    let ix = Instruction {
        program_id: *program.key,
        accounts: vec![
            AccountMeta::new_readonly(*aggregator_signer.key, true),
            AccountMeta::new(*validator_pool_vault.key, false),
            AccountMeta::new_readonly(*validator_pool_authority.key, false),
            AccountMeta::new(*reward_vault.key, false),
            AccountMeta::new_readonly(*token_program.key, false),
        ],
        data,
    };

    let before = read_token_amount(reward_vault)?;

    invoke_signed(
        &ix,
        &[
            aggregator_signer.clone(),
            validator_pool_vault.clone(),
            validator_pool_authority.clone(),
            reward_vault.clone(),
            token_program.clone(),
            program.clone(),
        ],
        &[signer_seeds],
    )?;

    let after = read_token_amount(reward_vault)?;
    Ok(after.saturating_sub(before))
}

/// Read SPL TokenAccount.amount (offset 64 from start of token-program account
/// data: [mint:32][owner:32][amount:u64]).
fn read_token_amount(token_account: &AccountInfo) -> Result<u64> {
    let data = token_account.try_borrow_data()?;
    require!(data.len() >= 72, AggregatorError::TokenAccountMalformed);
    Ok(u64::from_le_bytes([
        data[64], data[65], data[66], data[67], data[68], data[69], data[70], data[71],
    ]))
}

// ─────────────────────────────── Accounts ───────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + AggregatorConfig::SIZE,
        seeds = [b"aggregator_config"],
        bump,
    )]
    pub config: Account<'info, AggregatorConfig>,

    /// CHECK: signer PDA owned by this program; used as CPI signer into
    /// vista_protocol and oracle_registry. Stored solely to bind the bump.
    #[account(seeds = [b"aggregator_signer"], bump)]
    pub aggregator_signer: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct SubmitVerification<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"aggregator_config"], bump = config.bump)]
    pub config: Account<'info, AggregatorConfig>,

    /// CHECK: signer's OracleNode PDA in oracle_registry. The `seeds::program`
    /// + canonical bump constraint binds this account to the signer's pubkey
    /// derived under oracle_registry — preventing a signer from passing some
    /// other oracle's node as proof of stake.
    #[account(
        seeds = [b"oracle_node", oracle.key().as_ref()],
        seeds::program = config.oracle_registry,
        bump,
        constraint = oracle_node.owner == &config.oracle_registry @ AggregatorError::WrongRegistry,
    )]
    pub oracle_node: UncheckedAccount<'info>,

    /// CHECK: oracle_registry's Registry PDA. Used to read min_stake at submit
    /// time so that already-slashed oracles cannot keep voting.
    #[account(
        seeds = [b"registry"],
        seeds::program = config.oracle_registry,
        bump,
        constraint = registry.owner == &config.oracle_registry @ AggregatorError::WrongRegistry,
    )]
    pub registry: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + AttentionSession::SIZE,
        seeds = [b"attention_session", session_id.as_ref()],
        bump,
    )]
    pub attention_session: Account<'info, AttentionSession>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct AggregateResults<'info> {
    #[account(seeds = [b"aggregator_config"], bump = config.bump)]
    pub config: Account<'info, AggregatorConfig>,

    /// CHECK: signer PDA, signed via invoke_signed.
    #[account(mut, seeds = [b"aggregator_signer"], bump = config.signer_bump)]
    pub aggregator_signer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"attention_session", session_id.as_ref()],
        bump = attention_session.bump,
    )]
    pub attention_session: Account<'info, AttentionSession>,

    /// CHECK: oracle_registry program, validated against config.
    #[account(address = config.oracle_registry)]
    pub oracle_registry_program: UncheckedAccount<'info>,
    /// CHECK: registry PDA in oracle_registry.
    pub registry: UncheckedAccount<'info>,

    /// CHECK: vista_protocol program, validated against config.
    #[account(address = config.vista_protocol)]
    pub vista_protocol_program: UncheckedAccount<'info>,
    /// CHECK: per-session validator pool token account (vista_protocol).
    #[account(mut)]
    pub validator_pool_vault: UncheckedAccount<'info>,
    /// CHECK: PDA authority of validator_pool_vault.
    pub validator_pool_authority: UncheckedAccount<'info>,
    /// CHECK: oracle_registry's reward vault — recipient of drained pool.
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,

    /// CHECK: SPL token program (passed through to vista_protocol drain CPI).
    pub token_program: UncheckedAccount<'info>,
    // remaining_accounts[..]: oracle_node PDAs in submission order.
}

// ─────────────────────────────── State ───────────────────────────────

#[account]
pub struct AggregatorConfig {
    pub admin: Pubkey,
    pub vista_protocol: Pubkey,
    pub oracle_registry: Pubkey,
    pub min_quorum: u8,
    pub deviation_bps: u16,
    pub window_seconds: i64,
    pub bump: u8,
    pub signer_bump: u8,
}
impl AggregatorConfig {
    pub const SIZE: usize = 32 * 3 + 1 + 2 + 8 + 1 + 1;
}

#[account]
pub struct AttentionSession {
    pub session_id: [u8; 32],
    pub window_start: i64,
    pub submissions_count: u8,
    pub submissions: [OracleSubmission; MAX_SUBMISSIONS],
    pub is_settled: bool,
    pub consensus_score: u8,
    pub consensus_reached: bool,
    pub settled_at: i64,
    pub bump: u8,
}
impl AttentionSession {
    pub const SIZE: usize = 32 + 8 + 1 + (OracleSubmission::SIZE * MAX_SUBMISSIONS) + 1 + 1 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct OracleSubmission {
    pub oracle: Pubkey,
    pub score: u8,
    pub submitted_at: i64,
    pub is_outlier: bool,
}
impl OracleSubmission {
    pub const SIZE: usize = 32 + 1 + 8 + 1;
}

// ─────────────────────────────── Events ───────────────────────────────

#[event]
pub struct VerificationSubmitted {
    pub session_id: [u8; 32],
    pub oracle: Pubkey,
    pub score: u8,
    pub timestamp: i64,
}

#[event]
pub struct OutlierDetected {
    pub session_id: [u8; 32],
    pub oracle: Pubkey,
    pub score: u8,
    pub consensus: u8,
    pub slashed_amount: u64,
}

#[event]
pub struct SessionAggregated {
    pub session_id: [u8; 32],
    pub consensus_score: u8,
    pub consensus_reached: bool,
    pub honest_count: u8,
    pub slashed_count: u8,
    pub per_oracle_reward: u64,
    pub settled_at: i64,
}

// ─────────────────────────────── Errors ───────────────────────────────

#[error_code]
pub enum AggregatorError {
    #[msg("Invalid score (must be 0-100)")]
    InvalidScore,
    #[msg("Quorum must be at least 2")]
    QuorumTooLow,
    #[msg("Deviation must be <= 10000 bps")]
    InvalidDeviation,
    #[msg("Window seconds must be > 0")]
    InvalidWindow,
    #[msg("Session id mismatch")]
    SessionMismatch,
    #[msg("Session already settled")]
    AlreadySettled,
    #[msg("Submission window has expired")]
    WindowExpired,
    #[msg("Oracle has already submitted for this session")]
    AlreadySubmitted,
    #[msg("Maximum submissions reached for this session")]
    MaxSubmissionsReached,
    #[msg("Either window must expire or quorum must be reached before aggregation")]
    NotReadyToAggregate,
    #[msg("Need at least 2 submissions to aggregate")]
    InsufficientSubmissions,
    #[msg("remaining_accounts length must equal submissions_count")]
    RemainingAccountsMismatch,
    #[msg("Wrong oracle_registry program owns this OracleNode")]
    WrongRegistry,
    #[msg("OracleNode account data is malformed")]
    OracleNodeMalformed,
    #[msg("Registry account data is malformed")]
    RegistryMalformed,
    #[msg("Token account data is malformed")]
    TokenAccountMalformed,
    #[msg("Oracle node is not active (deregistered)")]
    OracleNotActive,
    #[msg("Oracle stake is below the registry's min_stake")]
    InsufficientStake,
    #[msg("remaining_accounts[i] does not match expected OracleNode for submissions[i].oracle")]
    OracleNodeBindingMismatch,
}
