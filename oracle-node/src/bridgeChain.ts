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
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import type { OracleConfig } from "./config.js";

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "2qpAkwCARH6EL39VjeNTwupQXhbYCoJkZcoDE2wPYSJm",
);

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

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

  constructor(private readonly cfg: OracleConfig) {
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.keypair = cfg.keypair;
    this.programId = cfg.programs.vistaBridge;
    [this.bridgeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge_config")],
      this.programId,
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
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

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
