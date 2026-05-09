/**
 * Mint test USDC (the custom devnet mint at vista_protocol.config.usdc_mint)
 * to a target wallet. Creates the recipient's ATA if missing. Requires the
 * caller to be the mint authority — i.e. the same keypair that ran
 * `spl-token create-token` to make the custom mint (typically your default
 * `~/.config/solana/id.json`).
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *     npx ts-node scripts/mint-test-usdc.ts <recipient pubkey> <amount in USDC>
 *
 * Example:
 *   npx ts-node scripts/mint-test-usdc.ts 91XRghDnaz6o5aTTTGcJxSz4QHi4vZDm322ku8DRtaWZ 1000
 */
import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";

const VISTA_PROTOCOL = new PublicKey(
  "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
);

async function main() {
  const [recipientArg, amountArg] = process.argv.slice(2);
  if (!recipientArg || !amountArg) {
    console.error(
      "Usage: mint-test-usdc.ts <recipient pubkey> <amount in USDC>",
    );
    process.exit(1);
  }
  const recipient = new PublicKey(recipientArg);
  const amountUsdc = Number(amountArg);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    console.error("✗ amount must be a positive number");
    process.exit(1);
  }
  // 6 decimals
  const rawAmount = BigInt(Math.round(amountUsdc * 1e6));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // Read config.usdc_mint from on-chain so we never drift from the program's
  // truth. Layout: disc(8) | admin(32) | usdc_mint(32) | ...
  const [cfgPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    VISTA_PROTOCOL,
  );
  const cfgInfo = await conn.getAccountInfo(cfgPda);
  if (!cfgInfo) {
    console.error("✗ vista_protocol config not found — run initialize first");
    process.exit(1);
  }
  const usdcMint = new PublicKey(cfgInfo.data.subarray(40, 72));
  console.log("usdc_mint (on-chain):", usdcMint.toBase58());
  console.log("payer (mint auth?)  :", payer.publicKey.toBase58());
  console.log("recipient           :", recipient.toBase58());
  console.log("amount              :", amountUsdc, "USDC (raw=", rawAmount.toString(), ")");

  const ata = getAssociatedTokenAddressSync(usdcMint, recipient, true);
  console.log("recipient ATA       :", ata.toBase58());

  const tx = new anchor.web3.Transaction();

  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      recipient,
      usdcMint,
    ),
  );

  tx.add(
    createMintToInstruction(usdcMint, ata, payer.publicKey, rawAmount),
  );

  const sig = await provider.sendAndConfirm(tx, [payer]);
  console.log("\n✅ tx:", sig);

  // Print final balance for sanity.
  try {
    const acc = await getAccount(conn, ata);
    console.log("recipient balance   :", Number(acc.amount) / 1e6, "USDC");
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error("\n✗", err);
  if (err instanceof Error && err.message.includes("0x4")) {
    console.error(
      "Hint: 0x4 from token program usually = 'owner does not match' — your\n" +
        "ANCHOR_WALLET is not the mint authority for this USDC mint. Re-run with\n" +
        "the keypair that you used in `spl-token create-token`.",
    );
  }
  process.exit(1);
});
