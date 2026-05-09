/**
 * One-shot fix: realign on-chain `vista_protocol.config` (oracle, vista_wallet)
 * to the keypairs in `scripts/.devnet-e2e-keypairs/`. Needed when the current
 * persisted actor keypairs differ from whoever was passed to `initialize` in
 * a prior deploy era.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *     npx ts-node scripts/realign-config.ts
 */
import * as anchor from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import type { VistaProtocol } from "../target/types/vista_protocol";

const STATE_DIR = path.resolve(__dirname, ".devnet-e2e-keypairs");

function loadKp(name: string): Keypair {
  const bytes = JSON.parse(
    fs.readFileSync(path.join(STATE_DIR, `${name}.json`), "utf-8"),
  );
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const vista = anchor.workspace.VistaProtocol as anchor.Program<VistaProtocol>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const oracle1 = loadKp("oracle_1");
  const vistaWallet = loadKp("vista_wallet");

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    vista.programId,
  );

  const before = await vista.account.config.fetch(configPda);
  console.log("─── Before ───");
  console.log("  config.oracle      :", before.oracle.toString());
  console.log("  config.vistaWallet :", before.vistaWallet.toString());
  console.log("  expected oracle    :", oracle1.publicKey.toString());
  console.log("  expected vista     :", vistaWallet.publicKey.toString());
  console.log("");

  if (before.oracle.toString() !== oracle1.publicKey.toString()) {
    console.log("→ updating oracle...");
    await vista.methods
      .setOracle(oracle1.publicKey)
      .accountsPartial({
        admin: admin.publicKey,
        config: configPda,
      })
      .rpc();
  } else {
    console.log("→ oracle already aligned");
  }

  if (before.vistaWallet.toString() !== vistaWallet.publicKey.toString()) {
    console.log("→ updating vista_wallet...");
    await vista.methods
      .setVistaWallet(vistaWallet.publicKey)
      .accountsPartial({
        admin: admin.publicKey,
        config: configPda,
      })
      .rpc();
  } else {
    console.log("→ vista_wallet already aligned");
  }

  const after = await vista.account.config.fetch(configPda);
  console.log("");
  console.log("─── After ───");
  console.log("  config.oracle      :", after.oracle.toString());
  console.log("  config.vistaWallet :", after.vistaWallet.toString());
  console.log("");
  console.log("✅ realignment done. Re-run scripts/devnet-e2e.ts now.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
