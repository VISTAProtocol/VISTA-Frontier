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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "node:crypto";

import type { OracleConfig } from "./config.js";

const SUBMIT_VERIFICATION_DISC = anchorDiscriminator("submit_verification");
const AGGREGATE_RESULTS_DISC = anchorDiscriminator("aggregate_results");
const START_STREAM_DISC = anchorDiscriminator("start_stream");
const TICK_STREAM_DISC = anchorDiscriminator("tick_stream");
const END_STREAM_DISC = anchorDiscriminator("end_stream");

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64LE(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof value === "bigint" ? value : BigInt(value));
  return buf;
}

export interface OracleNodeStateView {
  active: boolean;
  stake: bigint;
  rewardBalance: bigint;
  endpointUrl: string;
}

export interface VistaConfigView {
  usdcMint: PublicKey;
  oracle: PublicKey;
  vistaWallet: PublicKey;
}

export class ChainClient {
  readonly connection: Connection;
  readonly keypair: Keypair;
  readonly oracleNodePda: PublicKey;
  readonly aggregatorConfigPda: PublicKey;
  readonly aggregatorSignerPda: PublicKey;
  readonly registryPda: PublicKey;
  readonly rewardVaultPda: PublicKey;
  readonly vistaConfigPda: PublicKey;
  readonly vistaVaultAuthorityPda: PublicKey;
  readonly vistaUserVaultPda: PublicKey;
  readonly vistaReceiptCounterPda: PublicKey;

  // Lazily-loaded vista_protocol global config (oracle + vista_wallet + mint).
  private vistaConfigCache: VistaConfigView | null = null;

  constructor(private readonly cfg: OracleConfig) {
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.keypair = cfg.keypair;
    [this.oracleNodePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_node"), this.keypair.publicKey.toBuffer()],
      cfg.programs.oracleRegistry,
    );
    [this.aggregatorConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("aggregator_config")],
      cfg.programs.attentionAggregator,
    );
    [this.aggregatorSignerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("aggregator_signer")],
      cfg.programs.attentionAggregator,
    );
    [this.registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      cfg.programs.oracleRegistry,
    );
    [this.rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault")],
      cfg.programs.oracleRegistry,
    );
    [this.vistaConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      cfg.programs.vistaProtocol,
    );
    [this.vistaVaultAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority")],
      cfg.programs.vistaProtocol,
    );
    [this.vistaUserVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_vault")],
      cfg.programs.vistaProtocol,
    );
    [this.vistaReceiptCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt_counter")],
      cfg.programs.vistaProtocol,
    );
  }

  // ──────────────────── PDA helpers ────────────────────

  campaignPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), campaignId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  campaignVaultPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault"), campaignId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  campaignVaultAuthorityPda(campaignId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault_authority"), campaignId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  sessionPda(sessionId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("session"), sessionId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  validatorPoolVaultPda(sessionId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("validator_pool"), sessionId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  validatorPoolAuthorityPda(sessionId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("validator_pool_authority"), sessionId],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  balancePda(wallet: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), wallet.toBuffer()],
      this.cfg.programs.vistaProtocol,
    )[0];
  }
  attentionSessionPda(sessionId: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("attention_session"), sessionId],
      this.cfg.programs.attentionAggregator,
    )[0];
  }
  oracleNodePdaFor(oracle: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_node"), oracle.toBuffer()],
      this.cfg.programs.oracleRegistry,
    )[0];
  }

  // ──────────────────── Account reads ────────────────────

  /**
   * Decode this oracle's OracleNode account. Layout assumes Anchor's
   * fixed-capacity allocation (endpoint_url is allocated as 4+200 bytes), so
   * the active byte sits at endpointEnd + 56 (after 7 trailing u64/i64 fields).
   */
  async fetchSelf(): Promise<OracleNodeStateView | null> {
    const info = await this.connection.getAccountInfo(this.oracleNodePda);
    if (!info) return null;
    if (!info.owner.equals(this.cfg.programs.oracleRegistry)) return null;

    const data = info.data;
    if (data.length < 8 + 32 + 4) return null;
    const endpointLen = data.readUInt32LE(40);
    const endpointEnd = 44 + endpointLen;
    if (data.length < endpointEnd + 8 * 7 + 1 + 1) return null;

    const endpointUrl = data.subarray(44, endpointEnd).toString("utf8");
    const stake = data.readBigUInt64LE(endpointEnd);
    const rewardBalance = data.readBigUInt64LE(endpointEnd + 8);
    const activeOffset = endpointEnd + 56;
    const active = data[activeOffset] === 1;

    return { active, stake, rewardBalance, endpointUrl };
  }

  /**
   * Read the global vista_protocol Config account so the cranker knows which
   * keypair is the designated stream oracle, the vista wallet (for fee ATA),
   * and the USDC mint. Cached after first read; layout: disc(8) | admin(32)
   * | usdc_mint(32) | oracle(32) | vista_wallet(32) | bumps(2).
   */
  async fetchVistaConfig(): Promise<VistaConfigView | null> {
    if (this.vistaConfigCache) return this.vistaConfigCache;
    const info = await this.connection.getAccountInfo(this.vistaConfigPda);
    if (!info) return null;
    if (!info.owner.equals(this.cfg.programs.vistaProtocol)) return null;
    const d = info.data;
    if (d.length < 8 + 32 * 4) return null;
    const view: VistaConfigView = {
      usdcMint: new PublicKey(d.subarray(40, 72)),
      oracle: new PublicKey(d.subarray(72, 104)),
      vistaWallet: new PublicKey(d.subarray(104, 136)),
    };
    this.vistaConfigCache = view;
    return view;
  }

  /**
   * Read AttentionSession state to find which oracles have submitted (used
   * when building remaining_accounts for aggregate_results).
   */
  async fetchAttentionSubmissions(sessionId: Buffer): Promise<PublicKey[] | null> {
    const info = await this.connection.getAccountInfo(this.attentionSessionPda(sessionId));
    if (!info) return null;
    const d = info.data;
    // disc(8) | session_id(32) | window_start(8) | submissions_count(1) | submissions[]
    if (d.length < 8 + 32 + 8 + 1) return null;
    const count = d.readUInt8(48);
    const submissions: PublicKey[] = [];
    const SUB_SIZE = 32 + 1 + 8 + 1;
    for (let i = 0; i < count; i++) {
      const offset = 49 + i * SUB_SIZE;
      submissions.push(new PublicKey(d.subarray(offset, offset + 32)));
    }
    return submissions;
  }

  isStreamOracle(vistaConfig: VistaConfigView): boolean {
    return vistaConfig.oracle.equals(this.keypair.publicKey);
  }

  // ──────────────────── Tx send helpers ────────────────────

  private async sendTx(ixs: TransactionInstruction[]): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: this.keypair.publicKey,
      recentBlockhash: blockhash,
    });
    for (const ix of ixs) tx.add(ix);
    tx.sign(this.keypair);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  // ──────────────────── attention_aggregator ────────────────────

  async submitVerification(sessionId: Buffer, score: number): Promise<string> {
    const data = Buffer.concat([
      SUBMIT_VERIFICATION_DISC,
      sessionId,
      Buffer.from([Math.max(0, Math.min(100, Math.round(score)))]),
    ]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programs.attentionAggregator,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.aggregatorConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.oracleNodePda, isSigner: false, isWritable: false },
        { pubkey: this.registryPda, isSigner: false, isWritable: false },
        { pubkey: this.attentionSessionPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
    return this.sendTx([ix]);
  }

  /**
   * Permissionless. Reads submissions list from AttentionSession to populate
   * remaining_accounts (oracle_node PDAs, in submission order).
   */
  async aggregateResults(sessionId: Buffer): Promise<string> {
    const submitters = await this.fetchAttentionSubmissions(sessionId);
    if (!submitters || submitters.length < 2) {
      throw new Error("aggregate_results: not enough submissions yet");
    }
    const data = Buffer.concat([AGGREGATE_RESULTS_DISC, sessionId]);

    const remaining = submitters.map((oraclePk) => ({
      pubkey: this.oracleNodePdaFor(oraclePk),
      isSigner: false,
      isWritable: true,
    }));

    const ix = new TransactionInstruction({
      programId: this.cfg.programs.attentionAggregator,
      keys: [
        { pubkey: this.aggregatorConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.aggregatorSignerPda, isSigner: false, isWritable: true },
        { pubkey: this.attentionSessionPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: this.cfg.programs.oracleRegistry, isSigner: false, isWritable: false },
        { pubkey: this.registryPda, isSigner: false, isWritable: false },
        { pubkey: this.cfg.programs.vistaProtocol, isSigner: false, isWritable: false },
        { pubkey: this.validatorPoolVaultPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: this.validatorPoolAuthorityPda(sessionId), isSigner: false, isWritable: false },
        { pubkey: this.rewardVaultPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ...remaining,
      ],
      data,
    });
    return this.sendTx([ix]);
  }

  // ──────────────────── vista_protocol ────────────────────

  async startStream(args: {
    sessionId: Buffer;
    campaignId: Buffer;
    userWallet: PublicKey;
    publisherWallet: PublicKey;
    usdcMint: PublicKey;
  }): Promise<string> {
    const { sessionId, campaignId, userWallet, publisherWallet, usdcMint } = args;
    const data = Buffer.concat([START_STREAM_DISC, sessionId, campaignId]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programs.vistaProtocol,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.vistaConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.campaignPda(campaignId), isSigner: false, isWritable: false },
        { pubkey: this.sessionPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: userWallet, isSigner: false, isWritable: false },
        { pubkey: publisherWallet, isSigner: false, isWritable: false },
        { pubkey: this.validatorPoolAuthorityPda(sessionId), isSigner: false, isWritable: false },
        { pubkey: this.validatorPoolVaultPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
    return this.sendTx([ix]);
  }

  async tickStream(args: {
    sessionId: Buffer;
    campaignId: Buffer;
    userWallet: PublicKey;
    publisherWallet: PublicKey;
    vistaWallet: PublicKey;
    usdcMint: PublicKey;
    secondsElapsed: number;
  }): Promise<string> {
    const {
      sessionId,
      campaignId,
      userWallet,
      publisherWallet,
      vistaWallet,
      usdcMint,
      secondsElapsed,
    } = args;

    const vistaWalletAta = getAssociatedTokenAddressSync(usdcMint, vistaWallet, true);
    const data = Buffer.concat([TICK_STREAM_DISC, u64LE(secondsElapsed)]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programs.vistaProtocol,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.vistaConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.sessionPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: this.campaignPda(campaignId), isSigner: false, isWritable: true },
        { pubkey: this.campaignVaultAuthorityPda(campaignId), isSigner: false, isWritable: false },
        { pubkey: this.campaignVaultPda(campaignId), isSigner: false, isWritable: true },
        { pubkey: this.vistaUserVaultPda, isSigner: false, isWritable: true },
        { pubkey: this.vistaVaultAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: vistaWalletAta, isSigner: false, isWritable: true },
        { pubkey: this.validatorPoolVaultPda(sessionId), isSigner: false, isWritable: true },
        { pubkey: this.balancePda(userWallet), isSigner: false, isWritable: true },
        { pubkey: this.balancePda(publisherWallet), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
    return this.sendTx([ix]);
  }
}

// Re-export so callers don't need a separate import.
export { ASSOCIATED_TOKEN_PROGRAM_ID };
