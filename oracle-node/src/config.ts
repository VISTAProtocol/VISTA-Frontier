import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Keypair, PublicKey } from "@solana/web3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawConfig {
  rpcUrl: string;
  programIds: {
    vistaProtocol: string;
    oracleRegistry: string;
    attentionAggregator: string;
  };
  dashboardUrl: string;
  windowSeconds: number;
  selfCheckSeconds: number;
  antiReplayMaxDriftMs: number;
  antiReplayLruSize: number;
  antiReplayTtlMs: number;
  port: number;
}

function readConfig(): RawConfig {
  const configPath = path.resolve(__dirname, "../oracle.config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

function loadKeypair(envPath?: string): Keypair {
  const keypairPath = envPath ?? process.env.ORACLE_KEYPAIR_PATH ?? "./keypair.json";
  const resolved = path.isAbsolute(keypairPath)
    ? keypairPath
    : path.resolve(process.cwd(), keypairPath);
  const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface OracleConfig {
  rpcUrl: string;
  dashboardUrl: string;
  webhookSecret: string;
  port: number;
  windowSeconds: number;
  selfCheckSeconds: number;
  antiReplayMaxDriftMs: number;
  antiReplayLruSize: number;
  antiReplayTtlMs: number;
  programs: {
    vistaProtocol: PublicKey;
    oracleRegistry: PublicKey;
    attentionAggregator: PublicKey;
  };
  keypair: Keypair;
}

export function loadConfig(): OracleConfig {
  const raw = readConfig();
  const keypair = loadKeypair();
  return {
    rpcUrl: process.env.RPC_URL ?? raw.rpcUrl,
    dashboardUrl: process.env.DASHBOARD_URL ?? raw.dashboardUrl,
    webhookSecret: process.env.ORACLE_WEBHOOK_SECRET ?? "",
    port: Number(process.env.PORT ?? raw.port),
    windowSeconds: raw.windowSeconds,
    selfCheckSeconds: raw.selfCheckSeconds,
    antiReplayMaxDriftMs: raw.antiReplayMaxDriftMs,
    antiReplayLruSize: raw.antiReplayLruSize,
    antiReplayTtlMs: raw.antiReplayTtlMs,
    programs: {
      vistaProtocol: new PublicKey(raw.programIds.vistaProtocol),
      oracleRegistry: new PublicKey(raw.programIds.oracleRegistry),
      attentionAggregator: new PublicKey(raw.programIds.attentionAggregator),
    },
    keypair,
  };
}
