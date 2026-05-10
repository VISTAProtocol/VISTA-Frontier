import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal .env loader (no dep on dotenv)
function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvFile(path.resolve(__dirname, "../.env"));

// Layout: disc(8) | admin(32) | usdc_mint(32) | oracle(32) | vista_wallet(32) | lz_executor_authority(32) | bump(1)
const LZ_AUTH_OFFSET = 8 + 32 + 32 + 32 + 32; // 136

async function main() {
  const cfgRaw = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../oracle.config.json"), "utf-8"),
  );
  const rpcUrl = process.env.RPC_URL ?? cfgRaw.rpcUrl;
  const programId = new PublicKey(
    cfgRaw.programIds.vistaBridge ??
      "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
  );

  const inline = process.env.ORACLE_KEYPAIR_JSON?.trim();
  if (!inline) throw new Error("ORACLE_KEYPAIR_JSON not set");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(inline)));

  const conn = new Connection(rpcUrl, "confirmed");
  const [bridgeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    programId,
  );

  const info = await conn.getAccountInfo(bridgeConfigPda);
  if (!info) throw new Error(`bridge_config PDA ${bridgeConfigPda.toBase58()} not found`);

  const admin = new PublicKey(info.data.subarray(8, 8 + 32));
  const oracle = new PublicKey(info.data.subarray(8 + 64, 8 + 96));
  const vistaWallet = new PublicKey(info.data.subarray(8 + 96, 8 + 128));
  const lzAuth = new PublicKey(info.data.subarray(LZ_AUTH_OFFSET, LZ_AUTH_OFFSET + 32));

  console.log("RPC:                     ", rpcUrl);
  console.log("Program ID:              ", programId.toBase58());
  console.log("BridgeConfig PDA:        ", bridgeConfigPda.toBase58());
  console.log("---");
  console.log("admin (on-chain):        ", admin.toBase58());
  console.log("oracle (on-chain):       ", oracle.toBase58());
  console.log("vista_wallet (on-chain): ", vistaWallet.toBase58());
  console.log("lz_executor_authority:   ", lzAuth.toBase58());
  console.log("---");
  console.log("oracle-node keypair:     ", kp.publicKey.toBase58());
  console.log("---");
  const match = kp.publicKey.equals(lzAuth);
  console.log(match ? "MATCH — keypair == lz_executor_authority" : "MISMATCH — this is the cause of NotLzExecutor (0x1777)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
