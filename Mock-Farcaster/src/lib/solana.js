import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

export const NETWORK = WalletAdapterNetwork.Devnet;

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl(NETWORK);

export const VISTA_PROTOCOL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VISTA_PROTOCOL_PROGRAM_ID ??
    "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
);

// Circle's official test USDC mint on Solana devnet.
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

export function explorerUrl(type, value) {
  const base = "https://explorer.solana.com";
  const cluster = "?cluster=devnet";
  if (type === "address" || type === "token") {
    return `${base}/address/${value}${cluster}`;
  }
  return `${base}/tx/${value}${cluster}`;
}
