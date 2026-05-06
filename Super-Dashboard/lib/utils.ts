import { type ClassValue, clsx } from "clsx";
import { keccak256, toHex } from "viem";
import { twMerge } from "tailwind-merge";

const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeWallet(address?: string | null) {
  return address?.trim().toLowerCase() ?? "";
}

export function safeNumber(value?: string | number | null): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function formatUsdc(value?: string | number | null): number {
  return Number(safeNumber(value).toFixed(6));
}

export function formatCompactNumber(value?: string | number | null) {
  return compactFormatter.format(safeNumber(value));
}

export function truncateAddress(value?: string | null, visible = 4) {
  if (!value) return "0x0000...0000";
  if (value.length <= visible * 2 + 2) return value;

  return `${value.slice(0, visible + 2)}...${value.slice(-visible)}`;
}

export function truncateHash(value?: string | null, visible = 6) {
  if (!value) return "0x000000...000000";
  if (value.length <= visible * 2 + 2) return value;

  return `${value.slice(0, visible + 2)}...${value.slice(-visible)}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateShort(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatHourLabel(hour: number) {
  const start = `${String(hour).padStart(2, "0")}:00`;
  const end = `${String((hour + 1) % 24).padStart(2, "0")}:00`;
  return `${start} - ${end}`;
}

export function buildExplorerUrl(
  type: "tx" | "address" | "token",
  value: string,
) {
  const base = "https://sepolia.basescan.org";

  if (type === "address") {
    return `${base}/address/${value}`;
  }

  if (type === "token") {
    return `${base}/token/${value}`;
  }

  return `${base}/tx/${value}`;
}

/** @deprecated use buildExplorerUrl */
export const buildBaseSepoliaExplorerUrl = buildExplorerUrl;

export function bytes32FromSeed(seed: string): `0x${string}` {
  return keccak256(toHex(seed));
}

export function buildVistaPublisherApiKey(seed = crypto.randomUUID()) {
  return `vista_pub_${seed}`;
}

export function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function sumNumbers(
  values: Array<string | number | null | undefined>,
): number {
  return values.reduce<number>((total, value) => total + safeNumber(value), 0);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
