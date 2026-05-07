import { parseAbi } from "viem";

/// Minimal ERC-20 ABI for the four operations the dashboard needs.
export const USDC_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
]);

/// Native USDC has 6 decimals on every chain we support.
export const USDC_DECIMALS = 6;

export function usdcUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a non-negative finite number");
  }
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function formatUsdcUnits(units: bigint): string {
  const div = BigInt(10 ** USDC_DECIMALS);
  const whole = units / div;
  const frac = (units % div).toString().padStart(USDC_DECIMALS, "0");
  return `${whole.toString()}.${frac.replace(/0+$/, "") || "0"}`;
}
