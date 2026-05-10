import { createHash } from "node:crypto";
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
  createMintToInstruction,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

import type { OracleConfig } from "./config.js";

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/// BridgeConfig layout (Anchor):
/// disc(8) | admin(32) | usdc_mint(32) | oracle(32) | vista_wallet(32) | lz_executor_authority(32) | bump(1)
const BRIDGE_CONFIG_USDC_MINT_OFFSET = 8 + 32;
const BRIDGE_CONFIG_LZ_EXECUTOR_OFFSET = 8 + 32 + 32 + 32 + 32; // 136

const RECEIVE_CAMPAIGN_METADATA_DISC = disc("receive_campaign_metadata");
const CONFIRM_USDC_RECEIVED_DISC = disc("confirm_usdc_received");

export interface ReceiveCampaignParams {
  campaignId: Buffer; // 32
  advertiserEvm: Buffer; // 20
  sourceChainEid: number;
  totalBudget: bigint;
  ratePerSecond: bigint;
  duration: bigint;
  cctpNonce: bigint;
  /// Solana wallet to attribute on-chain ownership to. Pass system program
  /// pubkey if no Solana wallet is linked yet.
  advertiserSolana: PublicKey;
}

export class BridgeChainClient {
  readonly connection: Connection;
  readonly keypair: Keypair;
  readonly programId: PublicKey;
  readonly bridgeConfigPda: PublicKey;
  private cachedUsdcMint: PublicKey | null = null;

  constructor(private readonly cfg: OracleConfig) {
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.keypair = cfg.keypair;
    this.programId = cfg.programs.vistaBridge;
    [this.bridgeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge_config")],
      this.programId,
    );
  }

  /// Read `bridge_config.usdc_mint` directly from chain — the program's
  /// `address = bridge_config.usdc_mint` constraint will reject any other
  /// mint, so authoritatively sourcing it here eliminates the entire
  /// "env var got out of sync with on-chain config" failure mode (which
  /// is what causes ConstraintAddress 0x7dc / 2012 on the usdc_mint slot).
  /// Cached after first read; bridge_config.usdc_mint is immutable today.
  async fetchBridgeUsdcMint(): Promise<PublicKey> {
    if (this.cachedUsdcMint) return this.cachedUsdcMint;
    const info = await this.connection.getAccountInfo(this.bridgeConfigPda);
    if (!info) {
      throw new Error(
        `bridge_config PDA ${this.bridgeConfigPda.toBase58()} not found — vista_bridge isn't initialized on this cluster.`,
      );
    }
    if (info.data.length < BRIDGE_CONFIG_USDC_MINT_OFFSET + 32) {
      throw new Error(
        `bridge_config account too small (${info.data.length} bytes) — layout mismatch?`,
      );
    }
    this.cachedUsdcMint = new PublicKey(
      info.data.subarray(
        BRIDGE_CONFIG_USDC_MINT_OFFSET,
        BRIDGE_CONFIG_USDC_MINT_OFFSET + 32,
      ),
    );
    return this.cachedUsdcMint;
  }

  /// Read `bridge_config.lz_executor_authority` directly from chain. Used by
  /// the startup guard to fail-fast if this oracle instance is configured for
  /// cross-chain relaying but its keypair doesn't match the on-chain authority
  /// — otherwise the mismatch only surfaces as NotLzExecutor (0x1777) on the
  /// first EVM event, after a full poll cycle has burned.
  async fetchLzExecutorAuthority(): Promise<PublicKey> {
    const info = await this.connection.getAccountInfo(this.bridgeConfigPda);
    if (!info) {
      throw new Error(
        `bridge_config PDA ${this.bridgeConfigPda.toBase58()} not found — vista_bridge isn't initialized on this cluster.`,
      );
    }
    if (info.data.length < BRIDGE_CONFIG_LZ_EXECUTOR_OFFSET + 32) {
      throw new Error(
        `bridge_config account too small (${info.data.length} bytes) — layout mismatch?`,
      );
    }
    return new PublicKey(
      info.data.subarray(
        BRIDGE_CONFIG_LZ_EXECUTOR_OFFSET,
        BRIDGE_CONFIG_LZ_EXECUTOR_OFFSET + 32,
      ),
    );
  }

  campaignPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_campaign"), campaignId],
      this.programId,
    )[0];
  }

  vaultAuthorityPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_vault_authority"), campaignId],
      this.programId,
    )[0];
  }

  vaultPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_vault"), campaignId],
      this.programId,
    )[0];
  }

  /// LayerZero stub: in trusted-relayer mode the oracle node signs as both
  /// `payer` and `lz_executor_authority`. The on-chain program checks
  /// `lz_executor_authority == bridge_config.lz_executor_authority`, which
  /// must have been set to the oracle pubkey at `initialize_bridge`.
  async submitReceiveCampaignMetadata(
    p: ReceiveCampaignParams,
  ): Promise<string> {
    if (p.campaignId.length !== 32) {
      throw new Error(`campaignId must be 32 bytes, got ${p.campaignId.length}`);
    }
    if (p.advertiserEvm.length !== 20) {
      throw new Error(
        `advertiserEvm must be 20 bytes, got ${p.advertiserEvm.length}`,
      );
    }

    const data = Buffer.concat([
      RECEIVE_CAMPAIGN_METADATA_DISC,
      p.campaignId,
      p.advertiserEvm,
      u32Le(p.sourceChainEid),
      u64Le(p.totalBudget),
      u64Le(p.ratePerSecond),
      u64Le(p.duration),
      u64Le(p.cctpNonce),
    ]);

    const usdcMint = await this.fetchBridgeUsdcMint();

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true }, // payer
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: false }, // lz_executor_authority (stub)
        { pubkey: this.bridgeConfigPda, isSigner: false, isWritable: false },
        { pubkey: p.advertiserSolana, isSigner: false, isWritable: false },
        { pubkey: this.campaignPda(p.campaignId), isSigner: false, isWritable: true },
        { pubkey: this.vaultAuthorityPda(p.campaignId), isSigner: false, isWritable: false },
        { pubkey: this.vaultPda(p.campaignId), isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.send(ix);
  }

  /// Returns the on-chain mint authority for `bridge_config.usdc_mint`. Used
  /// at startup to verify the relayer keypair can actually mint into the
  /// per-campaign vault (Arsitektur 2). Returns null if the mint has been
  /// frozen / authority renounced.
  async fetchMintAuthority(): Promise<PublicKey | null> {
    const usdcMint = await this.fetchBridgeUsdcMint();
    const mint = await getMint(this.connection, usdcMint, "confirmed");
    return mint.mintAuthority;
  }

  /// Read current USDC balance held by the per-campaign vault PDA. Returns 0n
  /// if the account doesn't exist yet (e.g. before receive_campaign_metadata
  /// landed). Used to make `mintUsdcToVault` idempotent: re-running the same
  /// attestation must not double-mint after a relayer restart.
  async fetchVaultAmount(campaignId: Buffer): Promise<bigint> {
    const vault = this.vaultPda(campaignId);
    try {
      const acct = await getAccount(this.connection, vault, "confirmed");
      return acct.amount;
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) return 0n;
      throw err;
    }
  }

  /// Arsitektur 2: once Circle Iris has attested the EVM-side CCTP burn, we
  /// treat that as proof of finality and mint the equivalent supply of VISTA's
  /// Solana-side USDC mint into the per-campaign vault. The relayer keypair
  /// must be the mint authority for `bridge_config.usdc_mint` (verified at
  /// startup; today this is FRTMLy9... = lz_executor_authority = mint
  /// authority of the custom VISTA hackathon mint 2qpAkw...).
  ///
  /// Idempotent: callers should check `fetchVaultAmount` first and skip if
  /// vault already holds >= total_budget.
  async mintUsdcToVault(
    campaignId: Buffer,
    amount: bigint,
  ): Promise<string> {
    if (amount <= 0n) {
      throw new Error(`mintUsdcToVault: amount must be > 0, got ${amount}`);
    }
    const usdcMint = await this.fetchBridgeUsdcMint();
    const vault = this.vaultPda(campaignId);
    const ix = createMintToInstruction(
      usdcMint,
      vault,
      this.keypair.publicKey,
      amount,
    );
    return this.send(ix);
  }

  async submitConfirmUsdcReceived(campaignId: Buffer): Promise<string> {
    const data = CONFIRM_USDC_RECEIVED_DISC;
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: false }, // caller
        { pubkey: this.campaignPda(campaignId), isSigner: false, isWritable: true },
        { pubkey: this.vaultPda(campaignId), isSigner: false, isWritable: false },
      ],
      data,
    });
    return this.send(ix);
  }

  private async send(ix: TransactionInstruction): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: this.keypair.publicKey,
      recentBlockhash: blockhash,
    }).add(ix);
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

function u32Le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function u64Le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}
