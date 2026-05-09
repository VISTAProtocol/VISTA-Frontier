/**
 * Point vista_protocol.config.oracle at the locally-running oracle_1 keypair
 * so the oracle-node stream cranker (start_stream / tick_stream) actually
 * fires. The realign-config.ts script targets the e2e fixtures under
 * scripts/.devnet-e2e-keypairs/, but our running oracles live under
 * oracle-node/local-oracles/oracle_1.json — different keys entirely.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=$HOME/.config/solana/id.json \
 *     npx ts-node scripts/set-stream-oracle-local.ts
 */
import * as anchor from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import type { VistaProtocol } from "../target/types/vista_protocol";

function loadKp(filepath: string): Keypair {
  const bytes = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const vista = anchor.workspace.VistaProtocol as anchor.Program<VistaProtocol>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const localOracle1Path = path.resolve(
    __dirname,
    "../../oracle-node/local-oracles/oracle_1.json",
  );
  const localOracle1 = loadKp(localOracle1Path);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    vista.programId,
  );

  const before = await vista.account.config.fetch(configPda);
  console.log("─── Before ───");
  console.log("  config.admin       :", before.admin.toString());
  console.log("  config.oracle      :", before.oracle.toString());
  console.log("  signer (admin?)    :", admin.publicKey.toString());
  console.log("  desired oracle (local_1):", localOracle1.publicKey.toString());

  if (!before.admin.equals(admin.publicKey)) {
    console.error(
      `\n✗ The wallet at ANCHOR_WALLET (${admin.publicKey.toString()})\n  is NOT config.admin (${before.admin.toString()}).\n  set_oracle is gated by has_one = admin — point ANCHOR_WALLET at the\n  admin keypair that ran initialize, then re-run.`,
    );
    process.exit(1);
  }

  if (before.oracle.equals(localOracle1.publicKey)) {
    console.log("\n→ already aligned, nothing to do.");
    return;
  }

  console.log("\n→ calling set_oracle...");
  const sig = await vista.methods
    .setOracle(localOracle1.publicKey)
    .accountsPartial({
      admin: admin.publicKey,
      config: configPda,
    })
    .rpc();
  console.log("  tx:", sig);

  const after = await vista.account.config.fetch(configPda);
  console.log("\n─── After ───");
  console.log("  config.oracle      :", after.oracle.toString());

  if (!after.oracle.equals(localOracle1.publicKey)) {
    console.error("✗ oracle still mismatched — aborting.");
    process.exit(1);
  }
  console.log("\n✅ stream oracle now == local oracle_1. Restart the oracle-node\n   processes to pick up the new isStreamOracle gate.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
