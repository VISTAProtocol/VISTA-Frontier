import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";

import type { OracleConfig } from "./config.js";

const SUBMIT_VERIFICATION_DISC = anchorDiscriminator("submit_verification");

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export interface OracleNodeStateView {
  active: boolean;
  stake: bigint;
  rewardBalance: bigint;
  endpointUrl: string;
}

export class ChainClient {
  readonly connection: Connection;
  readonly keypair: Keypair;
  readonly oracleNodePda: PublicKey;
  readonly aggregatorConfigPda: PublicKey;
  readonly registryPda: PublicKey;

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
    [this.registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      cfg.programs.oracleRegistry,
    );
  }

  /**
   * Fetch this oracle's OracleNode account and decode the fields we need to
   * gate heartbeat acceptance. Returns null if not registered.
   */
  async fetchSelf(): Promise<OracleNodeStateView | null> {
    const info = await this.connection.getAccountInfo(this.oracleNodePda);
    if (!info) return null;
    if (!info.owner.equals(this.cfg.programs.oracleRegistry)) return null;

    // Layout: [disc:8][oracle:32][endpoint_len:4][endpoint:N][stake:u64]
    //         [reward_balance:u64][reputation:i64][total_subs:u64]
    //         [total_slashes:u64][registered_at:i64][unreg_at:i64]
    //         [active:1][bump:1]
    const data = info.data;
    if (data.length < 8 + 32 + 4) return null;
    const endpointLen = data.readUInt32LE(40);
    const endpointEnd = 44 + endpointLen;
    if (data.length < endpointEnd + 8 + 8) return null;

    const endpointUrl = data.subarray(44, endpointEnd).toString("utf8");
    const stake = data.readBigUInt64LE(endpointEnd);
    const rewardBalance = data.readBigUInt64LE(endpointEnd + 8);

    // active flag is one byte before the trailing bump.
    const activeOffset = data.length - 2;
    const active = data[activeOffset] === 1;

    return { active, stake, rewardBalance, endpointUrl };
  }

  async submitVerification(sessionId: Buffer, score: number): Promise<string> {
    const [attentionSession] = PublicKey.findProgramAddressSync(
      [Buffer.from("attention_session"), sessionId],
      this.cfg.programs.attentionAggregator,
    );

    const data = Buffer.concat([
      SUBMIT_VERIFICATION_DISC,
      sessionId, // [u8; 32]
      Buffer.from([Math.max(0, Math.min(100, Math.round(score)))]),
    ]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programs.attentionAggregator,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.aggregatorConfigPda, isSigner: false, isWritable: false },
        { pubkey: this.oracleNodePda, isSigner: false, isWritable: false },
        { pubkey: attentionSession, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

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
