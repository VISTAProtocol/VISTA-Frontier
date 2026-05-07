import { PublicKey, Connection } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

export const NETWORK = WalletAdapterNetwork.Devnet;

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl(NETWORK);

// Vista Protocol on devnet (synced via `anchor keys sync`).
export const VISTA_PROTOCOL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VISTA_PROTOCOL_PROGRAM_ID ??
    "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
);

export const VISTA_BRIDGE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VISTA_BRIDGE_PROGRAM_ID ??
    "9R7UWcCQVXW4dKKLYLLRfGQf5prePQBMyTEwd2TMC8sE",
);

// Circle's official test USDC mint on Solana devnet.
// Faucet: https://faucet.circle.com (Solana, devnet)
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

export const USDC_DECIMALS = 6;

// Vista's protocol fee recipient (set at `initialize`). Update after deploy.
export const VISTA_FEE_WALLET = new PublicKey(
  process.env.NEXT_PUBLIC_VISTA_FEE_WALLET ??
    "11111111111111111111111111111111",
);

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

// PDA helpers
export function configPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function vaultAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function userVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault")],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function receiptCounterPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt_counter")],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function campaignPda(campaignId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), Buffer.from(campaignId)],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function campaignVaultAuthorityPda(
  campaignId: Uint8Array,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_vault_authority"), Buffer.from(campaignId)],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function campaignVaultPda(campaignId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_vault"), Buffer.from(campaignId)],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function sessionPda(sessionId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(sessionId)],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function userBalancePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), wallet.toBuffer()],
    VISTA_PROTOCOL_PROGRAM_ID,
  );
}

export function explorerUrl(
  type: "tx" | "address" | "token",
  value: string,
): string {
  const cluster = "devnet";
  const base = "https://explorer.solana.com";
  if (type === "address" || type === "token") {
    return `${base}/address/${value}?cluster=${cluster}`;
  }
  return `${base}/tx/${value}?cluster=${cluster}`;
}
