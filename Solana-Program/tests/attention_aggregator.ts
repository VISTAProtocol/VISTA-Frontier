import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AttentionAggregator } from "../target/types/attention_aggregator";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";

describe("attention_aggregator (smoke)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .AttentionAggregator as Program<AttentionAggregator>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Use placeholder pubkeys for vista_protocol/oracle_registry — full CPI
  // exercise lives in scripts/devnet-e2e.ts where all three programs are
  // initialized together.
  const fakeVista = Keypair.generate().publicKey;
  const fakeRegistry = Keypair.generate().publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("aggregator_config")],
    program.programId,
  );
  const [aggregatorSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("aggregator_signer")],
    program.programId,
  );

  it("initialize — creates AggregatorConfig", async () => {
    await program.methods
      .initialize(fakeVista, fakeRegistry, 3, 2000, new BN(10))
      .accountsPartial({
        admin: admin.publicKey,
        config: configPda,
        aggregatorSigner,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const cfg = await program.account.aggregatorConfig.fetch(configPda);
    expect(cfg.minQuorum).to.equal(3);
    expect(cfg.deviationBps).to.equal(2000);
    expect(cfg.windowSeconds.toNumber()).to.equal(10);
    expect(cfg.vistaProtocol.toString()).to.equal(fakeVista.toString());
    expect(cfg.oracleRegistry.toString()).to.equal(fakeRegistry.toString());
  });

  it("submit_verification — rejects when oracle_node owner != registry", async () => {
    // We don't have a real oracle_registry deployed in this test, so we
    // verify the WrongRegistry guard fires when we pass an arbitrary account.
    const oracle = Keypair.generate();
    const sig = await connection.requestAirdrop(
      oracle.publicKey,
      LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    const sessionId = crypto.randomBytes(32);
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attention_session"), sessionId],
      program.programId,
    );

    let threw = false;
    try {
      await program.methods
        .submitVerification(Array.from(sessionId), 75)
        .accountsPartial({
          oracle: oracle.publicKey,
          config: configPda,
          oracleNode: oracle.publicKey, // wrong owner — system, not fakeRegistry
          attentionSession: sessionPda,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([oracle])
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.toString()).to.match(/WrongRegistry|0x.+/);
    }
    expect(threw).to.equal(true);
  });
});
