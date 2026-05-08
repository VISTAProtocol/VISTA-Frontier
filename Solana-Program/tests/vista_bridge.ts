import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { VistaBridge } from "../target/types/vista_bridge";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

describe("vista_bridge", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VistaBridge as Program<VistaBridge>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Roles
  const oracle = Keypair.generate();
  const lzExecutor = Keypair.generate();
  const vistaWallet = Keypair.generate();
  const advertiserSolana = Keypair.generate();
  const userWallet = Keypair.generate();
  const publisherWallet = Keypair.generate();

  let usdcMint: PublicKey;
  let bridgeConfigPda: PublicKey;
  let userAta: PublicKey;
  let publisherAta: PublicKey;
  let vistaAta: PublicKey;
  let validatorPoolAta: PublicKey;

  const campaignId = crypto.randomBytes(32);
  const sessionId = crypto.randomBytes(32);

  let xchainCampaignPda: PublicKey;
  let xchainVaultAuthorityPda: PublicKey;
  let xchainVaultPda: PublicKey;
  let sessionPda: PublicKey;

  before(async () => {
    // Fund actors who must sign
    for (const kp of [oracle, lzExecutor]) {
      const sig = await connection.requestAirdrop(
        kp.publicKey,
        LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }

    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);

    // ATAs for tick recipients
    userAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        userWallet.publicKey,
      )
    ).address;
    publisherAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        publisherWallet.publicKey,
      )
    ).address;
    vistaAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        vistaWallet.publicKey,
      )
    ).address;
    // Validator pool token account — owned by admin for the test, just a token-mint match.
    validatorPoolAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        admin.publicKey,
      )
    ).address;

    [bridgeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge_config")],
      program.programId,
    );
    [xchainCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_campaign"), campaignId],
      program.programId,
    );
    [xchainVaultAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_vault_authority"), campaignId],
      program.programId,
    );
    [xchainVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_vault"), campaignId],
      program.programId,
    );
    [sessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("xchain_session"), sessionId],
      program.programId,
    );
  });

  it("initialize_bridge — creates BridgeConfig", async () => {
    await program.methods
      .initializeBridge(
        oracle.publicKey,
        vistaWallet.publicKey,
        lzExecutor.publicKey,
      )
      .accountsPartial({
        admin: admin.publicKey,
        bridgeConfig: bridgeConfigPda,
        usdcMint,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const cfg = await program.account.bridgeConfig.fetch(bridgeConfigPda);
    expect(cfg.oracle.toString()).to.equal(oracle.publicKey.toString());
    expect(cfg.lzExecutorAuthority.toString()).to.equal(
      lzExecutor.publicKey.toString(),
    );
  });

  it("receive_campaign_metadata — rejects when lz_executor_authority is wrong", async () => {
    const fakeExecutor = Keypair.generate();
    const sig = await connection.requestAirdrop(
      fakeExecutor.publicKey,
      LAMPORTS_PER_SOL / 10,
    );
    await connection.confirmTransaction(sig, "confirmed");

    let threw = false;
    try {
      await program.methods
        .receiveCampaignMetadata(
          Array.from(campaignId),
          Array.from(crypto.randomBytes(20)), // advertiser_evm
          1, // source_chain_eid
          new BN(10_000_000), // 10 USDC
          new BN(100_000), // 0.1 USDC/sec
          new BN(60),
          new BN(42), // cctp_nonce
        )
        .accountsPartial({
          payer: admin.publicKey,
          lzExecutorAuthority: fakeExecutor.publicKey, // WRONG
          bridgeConfig: bridgeConfigPda,
          advertiserSolana: advertiserSolana.publicKey,
          crossChainCampaign: xchainCampaignPda,
          xchainVaultAuthority: xchainVaultAuthorityPda,
          xchainVault: xchainVaultPda,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([fakeExecutor])
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.toString()).to.match(/NotLzExecutor|0x/i);
    }
    expect(threw).to.equal(true);
  });

  it("receive_campaign_metadata — happy path with real lz_executor", async () => {
    await program.methods
      .receiveCampaignMetadata(
        Array.from(campaignId),
        Array.from(crypto.randomBytes(20)),
        1,
        new BN(10_000_000),
        new BN(100_000),
        new BN(60),
        new BN(42),
      )
      .accountsPartial({
        payer: admin.publicKey,
        lzExecutorAuthority: lzExecutor.publicKey,
        bridgeConfig: bridgeConfigPda,
        advertiserSolana: advertiserSolana.publicKey,
        crossChainCampaign: xchainCampaignPda,
        xchainVaultAuthority: xchainVaultAuthorityPda,
        xchainVault: xchainVaultPda,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([lzExecutor])
      .rpc();

    const c = await program.account.crossChainCampaign.fetch(xchainCampaignPda);
    expect(c.totalBudget.toNumber()).to.equal(10_000_000);
    expect(c.usdcConfirmed).to.equal(false);
    expect(c.isActive).to.equal(false);
    expect(c.cctpNonce.toNumber()).to.equal(42);
  });

  it("confirm_usdc_received — fails when vault balance < total_budget", async () => {
    let threw = false;
    try {
      await program.methods
        .confirmUsdcReceived()
        .accountsPartial({
          caller: admin.publicKey,
          crossChainCampaign: xchainCampaignPda,
          xchainVault: xchainVaultPda,
        })
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.toString()).to.match(/InsufficientUsdcReceived|0x/i);
    }
    expect(threw).to.equal(true);
  });

  it("confirm_usdc_received — flips is_active once vault is funded", async () => {
    // Simulate CCTP delivery by minting USDC into the per-campaign vault PDA.
    await mintTo(
      connection,
      admin,
      usdcMint,
      xchainVaultPda,
      admin,
      10_000_000,
    );

    await program.methods
      .confirmUsdcReceived()
      .accountsPartial({
        caller: admin.publicKey,
        crossChainCampaign: xchainCampaignPda,
        xchainVault: xchainVaultPda,
      })
      .rpc();

    const c = await program.account.crossChainCampaign.fetch(xchainCampaignPda);
    expect(c.usdcConfirmed).to.equal(true);
    expect(c.isActive).to.equal(true);
  });

  it("start_cross_chain_stream — oracle gates session creation", async () => {
    await program.methods
      .startCrossChainStream(Array.from(sessionId), Array.from(campaignId))
      .accountsPartial({
        oracle: oracle.publicKey,
        bridgeConfig: bridgeConfigPda,
        crossChainCampaign: xchainCampaignPda,
        session: sessionPda,
        userWallet: userWallet.publicKey,
        publisherWallet: publisherWallet.publicKey,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([oracle])
      .rpc();

    const s = await program.account.crossChainSession.fetch(sessionPda);
    expect(s.active).to.equal(true);
    expect(s.userWallet.toString()).to.equal(userWallet.publicKey.toString());
  });

  it("tick_cross_chain — splits 30/50/10/10 directly to ATAs", async () => {
    const [userBal] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge_balance"), userWallet.publicKey.toBuffer()],
      program.programId,
    );
    const [publisherBal] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge_balance"), publisherWallet.publicKey.toBuffer()],
      program.programId,
    );

    // 5 seconds × 100_000 = 500_000 atoms total
    // user 30% = 150_000, publisher 50% = 250_000, validator 10% = 50_000, vista 10% = 50_000
    await program.methods
      .tickCrossChain(new BN(5))
      .accountsPartial({
        oracle: oracle.publicKey,
        bridgeConfig: bridgeConfigPda,
        session: sessionPda,
        crossChainCampaign: xchainCampaignPda,
        xchainVaultAuthority: xchainVaultAuthorityPda,
        xchainVault: xchainVaultPda,
        userToken: userAta,
        publisherToken: publisherAta,
        validatorPool: validatorPoolAta,
        vistaWalletToken: vistaAta,
        userBalance: userBal,
        publisherBalance: publisherBal,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([oracle])
      .rpc();

    const userBalance = await getAccount(connection, userAta);
    const publisherBalance = await getAccount(connection, publisherAta);
    const validatorBalance = await getAccount(connection, validatorPoolAta);
    const vistaBalance = await getAccount(connection, vistaAta);

    expect(Number(userBalance.amount)).to.equal(150_000);
    expect(Number(publisherBalance.amount)).to.equal(250_000);
    expect(Number(validatorBalance.amount)).to.equal(50_000);
    expect(Number(vistaBalance.amount)).to.equal(50_000);
  });

  it("end_cross_chain_stream — closes session", async () => {
    await program.methods
      .endCrossChainStream()
      .accountsPartial({
        oracle: oracle.publicKey,
        bridgeConfig: bridgeConfigPda,
        session: sessionPda,
      })
      .signers([oracle])
      .rpc();

    const s = await program.account.crossChainSession.fetch(sessionPda);
    expect(s.active).to.equal(false);
  });
});
