import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import { VistaProtocol } from "../target/types/vista_protocol";
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
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

describe("vista_protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VistaProtocol as Program<VistaProtocol>;
  const connection = provider.connection;

  // Actors
  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();
  const advertiser = Keypair.generate();
  const userWallet = Keypair.generate();
  const publisherWallet = Keypair.generate();
  const vistaWallet = Keypair.generate();

  // State filled in `before`
  let usdcMint: PublicKey;
  let advertiserAta: PublicKey;
  let userAta: PublicKey;
  let publisherAta: PublicKey;
  let vistaWalletAta: PublicKey;

  // PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    program.programId,
  );
  const [userVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault")],
    program.programId,
  );
  const [receiptCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("receipt_counter")],
    program.programId,
  );

  const campaignId = crypto.randomBytes(32);
  const sessionId = crypto.randomBytes(32);
  const [campaignPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), campaignId],
    program.programId,
  );
  const [campaignVaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_vault_authority"), campaignId],
    program.programId,
  );
  const [campaignVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_vault"), campaignId],
    program.programId,
  );
  const [sessionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), sessionId],
    program.programId,
  );
  const [validatorPoolAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("validator_pool_authority"), sessionId],
    program.programId,
  );
  const [validatorPoolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("validator_pool"), sessionId],
    program.programId,
  );
  const [userBalancePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), userWallet.publicKey.toBuffer()],
    program.programId,
  );
  const [publisherBalancePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), publisherWallet.publicKey.toBuffer()],
    program.programId,
  );

  // Campaign params (USDC has 6 decimals → 1 USDC = 1_000_000)
  const totalBudget = new BN(10_000_000); // 10 USDC
  const ratePerSecond = new BN(100_000); // 0.1 USDC/s
  const duration = new BN(60); // 60 seconds

  before(async () => {
    // Fund the actors that need to sign txs
    for (const kp of [oracle, advertiser, userWallet]) {
      const sig = await connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }

    // Create a fresh mint with 6 decimals (matching USDC)
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      6,
    );

    advertiserAta = await createAssociatedTokenAccount(
      connection,
      advertiser,
      usdcMint,
      advertiser.publicKey,
    );
    userAta = await createAssociatedTokenAccount(
      connection,
      userWallet,
      usdcMint,
      userWallet.publicKey,
    );
    publisherAta = await createAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      publisherWallet.publicKey,
    );
    vistaWalletAta = await createAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      vistaWallet.publicKey,
    );

    // Mint 100 USDC to advertiser
    await mintTo(
      connection,
      admin,
      usdcMint,
      advertiserAta,
      admin,
      100_000_000,
    );
  });

  it("initialize — creates config + user_vault + receipt_counter", async () => {
    await program.methods
      .initialize(oracle.publicKey, vistaWallet.publicKey)
      .accountsPartial({
        admin: admin.publicKey,
        config: configPda,
        usdcMint,
        vaultAuthority,
        userVault,
        receiptCounter,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    expect(config.admin.toString()).to.equal(admin.publicKey.toString());
    expect(config.oracle.toString()).to.equal(oracle.publicKey.toString());
    expect(config.vistaWallet.toString()).to.equal(
      vistaWallet.publicKey.toString(),
    );
    expect(config.usdcMint.toString()).to.equal(usdcMint.toString());
  });

  it("deposit_campaign — locks USDC into campaign vault", async () => {
    await program.methods
      .depositCampaign(
        Array.from(campaignId),
        totalBudget,
        ratePerSecond,
        duration,
      )
      .accountsPartial({
        advertiser: advertiser.publicKey,
        config: configPda,
        campaign: campaignPda,
        campaignVaultAuthority,
        campaignVault,
        advertiserToken: advertiserAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([advertiser])
      .rpc();

    const c = await program.account.campaign.fetch(campaignPda);
    expect(c.totalBudget.toString()).to.equal(totalBudget.toString());
    expect(c.remainingBudget.toString()).to.equal(totalBudget.toString());
    expect(c.active).to.equal(true);

    const cv = await getAccount(connection, campaignVault);
    expect(cv.amount.toString()).to.equal(totalBudget.toString());
  });

  it("start_stream — only oracle can call", async () => {
    // Negative: advertiser tries to start
    let threw = false;
    try {
      await program.methods
        .startStream(Array.from(sessionId), Array.from(campaignId))
        .accountsPartial({
          oracle: advertiser.publicKey, // wrong signer
          config: configPda,
          campaign: campaignPda,
          session: sessionPda,
          userWallet: userWallet.publicKey,
          publisherWallet: publisherWallet.publicKey,
          validatorPoolAuthority,
          validatorPoolVault,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([advertiser])
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.toString()).to.match(/NotOracle|0x.+/);
    }
    expect(threw, "expected NotOracle revert").to.equal(true);

    // Positive
    await program.methods
      .startStream(Array.from(sessionId), Array.from(campaignId))
      .accountsPartial({
        oracle: oracle.publicKey,
        config: configPda,
        campaign: campaignPda,
        session: sessionPda,
        userWallet: userWallet.publicKey,
        publisherWallet: publisherWallet.publicKey,
        validatorPoolAuthority,
        validatorPoolVault,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([oracle])
      .rpc();

    const s = await program.account.session.fetch(sessionPda);
    expect(s.active).to.equal(true);
    expect(s.userWallet.toString()).to.equal(userWallet.publicKey.toString());
  });

  it("tick_stream — splits 30/50/10/10 across 3 ticks of 5 seconds", async () => {
    for (let i = 0; i < 3; i++) {
      await program.methods
        .tickStream(new BN(5))
        .accountsPartial({
          oracle: oracle.publicKey,
          config: configPda,
          session: sessionPda,
          campaign: campaignPda,
          campaignVaultAuthority,
          campaignVault,
          userVault,
          vaultAuthority,
          vistaWalletToken: vistaWalletAta,
          validatorPoolVault,
          userBalance: userBalancePda,
          publisherBalance: publisherBalancePda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([oracle])
        .rpc();
    }

    // 3 ticks * 5 seconds * 100_000 rate = 1_500_000 total
    // user 30% = 450_000, publisher 50% = 750_000, validator 10% = 150_000, vista 10% = 150_000
    const userBalance = await program.account.userBalance.fetch(userBalancePda);
    const publisherBalance = await program.account.userBalance.fetch(
      publisherBalancePda,
    );
    expect(userBalance.balance.toString()).to.equal("450000");
    expect(publisherBalance.balance.toString()).to.equal("750000");

    const vistaTokenAcc = await getAccount(connection, vistaWalletAta);
    expect(vistaTokenAcc.amount.toString()).to.equal("150000");

    const validatorPoolAcc = await getAccount(connection, validatorPoolVault);
    expect(validatorPoolAcc.amount.toString()).to.equal("150000");

    const userVaultAcc = await getAccount(connection, userVault);
    expect(userVaultAcc.amount.toString()).to.equal("1200000"); // 450k + 750k

    const c = await program.account.campaign.fetch(campaignPda);
    expect(c.remainingBudget.toString()).to.equal("8500000"); // 10M - 1.5M
  });

  it("end_stream — closes session and mints receipt", async () => {
    const counterBefore = await program.account.receiptCounter.fetch(
      receiptCounter,
    );
    const tokenIdBytes = counterBefore.nextId.toArrayLike(Buffer, "le", 8);
    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), tokenIdBytes],
      program.programId,
    );

    await program.methods
      .endStream()
      .accountsPartial({
        oracle: oracle.publicKey,
        config: configPda,
        session: sessionPda,
        campaign: campaignPda,
        receiptCounter,
        receipt: receiptPda,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([oracle])
      .rpc();

    const session = await program.account.session.fetch(sessionPda);
    expect(session.active).to.equal(false);
    expect(session.secondsVerified.toString()).to.equal("15");
    expect(session.totalPaid.toString()).to.equal("1500000");

    const receipt = await program.account.receipt.fetch(receiptPda);
    expect(receipt.userWallet.toString()).to.equal(
      userWallet.publicKey.toString(),
    );
    expect(receipt.secondsVerified.toString()).to.equal("15");
    expect(receipt.usdcPaid.toString()).to.equal("1500000");
  });

  it("withdraw — user pulls earnings to their ATA", async () => {
    const beforeAta = await getAccount(connection, userAta);
    expect(beforeAta.amount.toString()).to.equal("0");

    await program.methods
      .withdraw()
      .accountsPartial({
        beneficiary: userWallet.publicKey,
        config: configPda,
        userBalance: userBalancePda,
        userVault,
        vaultAuthority,
        beneficiaryToken: userAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userWallet])
      .rpc();

    const afterAta = await getAccount(connection, userAta);
    expect(afterAta.amount.toString()).to.equal("450000");

    const userBalance = await program.account.userBalance.fetch(userBalancePda);
    expect(userBalance.balance.toString()).to.equal("0");

    // Second withdraw should fail
    let threw = false;
    try {
      await program.methods
        .withdraw()
        .accountsPartial({
          beneficiary: userWallet.publicKey,
          config: configPda,
          userBalance: userBalancePda,
          userVault,
          vaultAuthority,
          beneficiaryToken: userAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userWallet])
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.toString()).to.match(/NothingToWithdraw|0x.+/);
    }
    expect(threw, "expected NothingToWithdraw revert").to.equal(true);
  });

  // ── refund_stuck_validator_pool (uses Surfpool time-travel) ─────────────
  describe("refund_stuck_validator_pool", () => {
    const stuckCampaignId = crypto.randomBytes(32);
    const stuckSessionId = crypto.randomBytes(32);
    const [stuckCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), stuckCampaignId],
      program.programId,
    );
    const [stuckCampaignVaultAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault_authority"), stuckCampaignId],
      program.programId,
    );
    const [stuckCampaignVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault"), stuckCampaignId],
      program.programId,
    );
    const [stuckSessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("session"), stuckSessionId],
      program.programId,
    );
    const [stuckPoolAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("validator_pool_authority"), stuckSessionId],
      program.programId,
    );
    const [stuckPoolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("validator_pool"), stuckSessionId],
      program.programId,
    );

    it("rejects refund while grace period is active", async () => {
      // Set up a fresh campaign + session; tick once to put USDC into the
      // validator pool. Aggregator never settles → pool is stranded.
      await mintTo(
        connection,
        admin,
        usdcMint,
        advertiserAta,
        admin,
        2_000_000,
      );
      await program.methods
        .depositCampaign(
          Array.from(stuckCampaignId),
          new BN(1_000_000), // 1 USDC budget
          new BN(100_000), // 0.1 USDC/sec
          new BN(60),
        )
        .accountsPartial({
          advertiser: advertiser.publicKey,
          config: configPda,
          campaign: stuckCampaignPda,
          campaignVaultAuthority: stuckCampaignVaultAuth,
          campaignVault: stuckCampaignVault,
          advertiserToken: advertiserAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([advertiser])
        .rpc();

      await program.methods
        .startStream(Array.from(stuckSessionId), Array.from(stuckCampaignId))
        .accountsPartial({
          oracle: oracle.publicKey,
          config: configPda,
          campaign: stuckCampaignPda,
          session: stuckSessionPda,
          userWallet: userWallet.publicKey,
          publisherWallet: publisherWallet.publicKey,
          validatorPoolAuthority: stuckPoolAuthority,
          validatorPoolVault: stuckPoolVault,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([oracle])
        .rpc();

      const [stuckUserBal] = PublicKey.findProgramAddressSync(
        [Buffer.from("balance"), userWallet.publicKey.toBuffer()],
        program.programId,
      );
      const [stuckPubBal] = PublicKey.findProgramAddressSync(
        [Buffer.from("balance"), publisherWallet.publicKey.toBuffer()],
        program.programId,
      );

      // 5 seconds × 100_000 = 500_000 atoms total. validator gets 50_000.
      await program.methods
        .tickStream(new BN(5))
        .accountsPartial({
          oracle: oracle.publicKey,
          config: configPda,
          session: stuckSessionPda,
          campaign: stuckCampaignPda,
          campaignVaultAuthority: stuckCampaignVaultAuth,
          campaignVault: stuckCampaignVault,
          userVault,
          vaultAuthority,
          vistaWalletToken: vistaWalletAta,
          validatorPoolVault: stuckPoolVault,
          userBalance: stuckUserBal,
          publisherBalance: stuckPubBal,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([oracle])
        .rpc();

      const poolBefore = await getAccount(connection, stuckPoolVault);
      expect(Number(poolBefore.amount)).to.equal(50_000);

      // Try to refund immediately → should hit GracePeriodActive (7 days).
      const caller = Keypair.generate();
      const sig = await connection.requestAirdrop(
        caller.publicKey,
        LAMPORTS_PER_SOL / 10,
      );
      await connection.confirmTransaction(sig, "confirmed");

      let threw = false;
      try {
        await program.methods
          .refundStuckValidatorPool(Array.from(stuckSessionId))
          .accountsPartial({
            caller: caller.publicKey,
            session: stuckSessionPda,
            campaign: stuckCampaignPda,
            validatorPoolVault: stuckPoolVault,
            validatorPoolAuthority: stuckPoolAuthority,
            advertiserToken: advertiserAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([caller])
          .rpc();
      } catch (e: any) {
        threw = true;
        expect(e.toString()).to.match(/GracePeriodActive|0x/i);
      }
      expect(threw, "expected GracePeriodActive while < 7 days").to.equal(true);
    });

    it("rejects refund to non-advertiser ATA even after grace expires", async () => {
      // Warp past grace period using Surfpool's surfnet_timeTravel cheatcode.
      // Note: Surfpool's absoluteTimestamp parameter is in MILLISECONDS.
      const sevenDaysAheadMs = Date.now() + (7 * 24 * 60 * 60 + 60) * 1000;
      const rpcUrl = (provider.connection as any)._rpcEndpoint;
      const resp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "surfnet_timeTravel",
          params: [{ absoluteTimestamp: sevenDaysAheadMs }],
        }),
      });
      const json = (await resp.json()) as { result?: unknown; error?: unknown };
      if (json.error) {
        throw new Error(
          `surfnet_timeTravel failed (need Surfpool): ${JSON.stringify(json.error)}`,
        );
      }

      // Caller passes a token account whose owner != campaign.advertiser.
      const attacker = Keypair.generate();
      const sig = await connection.requestAirdrop(
        attacker.publicKey,
        LAMPORTS_PER_SOL / 10,
      );
      await connection.confirmTransaction(sig, "confirmed");
      const attackerAta = await createAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        attacker.publicKey,
      );

      let threw = false;
      let errStr = "";
      try {
        await program.methods
          .refundStuckValidatorPool(Array.from(stuckSessionId))
          .accountsPartial({
            caller: attacker.publicKey,
            session: stuckSessionPda,
            campaign: stuckCampaignPda,
            validatorPoolVault: stuckPoolVault,
            validatorPoolAuthority: stuckPoolAuthority,
            advertiserToken: attackerAta, // WRONG owner
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();
      } catch (e: any) {
        threw = true;
        errStr = e.toString();
      }
      expect(threw, "expected NotAdvertiser revert").to.equal(true);
      expect(errStr).to.match(/NotAdvertiser/);
    });

    it("permissionless refund returns stuck pool to advertiser after grace", async () => {
      const advertiserBefore = await getAccount(connection, advertiserAta);
      const poolBefore = await getAccount(connection, stuckPoolVault);
      expect(Number(poolBefore.amount)).to.equal(50_000);

      // Anyone can call — use a brand-new keypair as the permissionless caller.
      const caller = Keypair.generate();
      const sig = await connection.requestAirdrop(
        caller.publicKey,
        LAMPORTS_PER_SOL / 10,
      );
      await connection.confirmTransaction(sig, "confirmed");

      await program.methods
        .refundStuckValidatorPool(Array.from(stuckSessionId))
        .accountsPartial({
          caller: caller.publicKey,
          session: stuckSessionPda,
          campaign: stuckCampaignPda,
          validatorPoolVault: stuckPoolVault,
          validatorPoolAuthority: stuckPoolAuthority,
          advertiserToken: advertiserAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([caller])
        .rpc();

      const advertiserAfter = await getAccount(connection, advertiserAta);
      const poolAfter = await getAccount(connection, stuckPoolVault);
      expect(Number(poolAfter.amount)).to.equal(0);
      expect(
        Number(advertiserAfter.amount) - Number(advertiserBefore.amount),
      ).to.equal(50_000);
    });
  });
});
