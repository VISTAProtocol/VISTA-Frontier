import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
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

  it("submit_verification — rejects when oracle_node + registry are bogus", async () => {
    // We don't have a real oracle_registry deployed in this test, so any
    // arbitrary account passed for oracle_node + registry MUST be rejected by
    // one of: seeds::program binding mismatch, owner constraint, or missing
    // accounts. The point: a signer cannot get a verification accepted without
    // a properly-derived OracleNode + Registry under config.oracle_registry.
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
          oracleNode: oracle.publicKey, // bogus
          registry: fakeRegistry, // bogus
          attentionSession: sessionPda,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([oracle])
        .rpc();
    } catch (e: any) {
      threw = true;
      // Accept any of the rejection paths — all are correct safety guards.
      expect(e.toString()).to.match(
        /WrongRegistry|registry|seeds|ConstraintSeeds|0x/i,
      );
    }
    expect(threw).to.equal(true);
  });
});
