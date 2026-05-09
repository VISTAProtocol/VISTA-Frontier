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
    vistaBridge?: string;
  };
  dashboardUrl: string;
  windowSeconds: number;
  selfCheckSeconds: number;
  antiReplayMaxDriftMs: number;
  antiReplayLruSize: number;
  antiReplayTtlMs: number;
  port: number;
  crossChain?: {
    cctpAttestationUrl?: string;
    cctpPollIntervalMs?: number;
    cctpMaxWaitMs?: number;
  };
}

export interface EvmChainConfig {
  /// Display key e.g. "base-sepolia", "arbitrum-sepolia". Stored on the
  /// dashboard's `campaigns.source_chain` column for attribution.
  key: "base-sepolia" | "arbitrum-sepolia";
  chainId: number;
  rpcUrl: string;
  vistaGateway: `0x${string}`;
  /// Circle CCTP source domain id for this chain (Base = 6, Arbitrum = 3).
  cctpSourceDomain: number;
  /// LayerZero V2 endpoint id (informational — used for log lines + payload
  /// attribution to the on-chain `source_chain_eid` field).
  lzEid: number;
}

function readConfig(): RawConfig {
  const configPath = path.resolve(__dirname, "../oracle.config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

function loadKeypair(): Keypair {
  const inline = process.env.ORACLE_KEYPAIR_JSON?.trim();
  if (!inline) {
    throw new Error(
      "ORACLE_KEYPAIR_JSON env var is required (raw secret key as JSON array)",
    );
  }
  const secret = JSON.parse(inline);
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
    vistaBridge: PublicKey;
  };
  keypair: Keypair;
  crossChain: {
    enabled: boolean;
    chains: EvmChainConfig[];
    cctpAttestationUrl: string;
    cctpPollIntervalMs: number;
    cctpMaxWaitMs: number;
  };
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
      vistaBridge: new PublicKey(
        raw.programIds.vistaBridge ??
          "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
      ),
    },
    keypair,
    crossChain: loadCrossChainConfig(raw),
  };
}

function loadCrossChainConfig(raw: RawConfig): OracleConfig["crossChain"] {
  const chains: EvmChainConfig[] = [];

  const baseGateway = process.env.VISTA_GATEWAY_BASE_SEPOLIA;
  const baseRpc = process.env.BASE_SEPOLIA_RPC;
  if (baseGateway && baseRpc) {
    chains.push({
      key: "base-sepolia",
      chainId: 84532,
      rpcUrl: baseRpc,
      vistaGateway: baseGateway as `0x${string}`,
      cctpSourceDomain: 6,
      lzEid: 40245,
    });
  }

  const arbGateway = process.env.VISTA_GATEWAY_ARB_SEPOLIA;
  const arbRpc = process.env.ARBITRUM_SEPOLIA_RPC;
  if (arbGateway && arbRpc) {
    chains.push({
      key: "arbitrum-sepolia",
      chainId: 421614,
      rpcUrl: arbRpc,
      vistaGateway: arbGateway as `0x${string}`,
      cctpSourceDomain: 3,
      lzEid: 40231,
    });
  }

  return {
    enabled: chains.length > 0,
    chains,
    cctpAttestationUrl:
      process.env.CIRCLE_IRIS_URL ??
      raw.crossChain?.cctpAttestationUrl ??
      "https://iris-api-sandbox.circle.com",
    cctpPollIntervalMs:
      Number(process.env.CCTP_POLL_INTERVAL_MS ?? "") ||
      raw.crossChain?.cctpPollIntervalMs ||
      30_000,
    cctpMaxWaitMs:
      Number(process.env.CCTP_MAX_WAIT_MS ?? "") ||
      raw.crossChain?.cctpMaxWaitMs ||
      30 * 60_000,
  };
}
