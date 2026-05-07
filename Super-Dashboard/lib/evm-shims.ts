/**
 * Drop-in stubs for the wagmi/viem hooks the dashboard previously used to
 * read EVM contracts on Base Sepolia. The protocol has moved to Solana, so
 * these on-chain reads are no longer applicable; pages now rely on Supabase
 * via /api/* routes for the same data.
 *
 * Each shim returns an empty/default value matching the wagmi shape, so the
 * existing call sites compile without modification. TODO: replace each
 * call site with the equivalent Anchor read (see lib/vista-actions.ts) and
 * remove this module.
 */

export function useReadContract<T = unknown>(_args?: unknown): {
  data: T | undefined;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  return {
    data: undefined,
    isLoading: false,
    refetch: async () => undefined,
  };
}

export function useReadContracts<T = unknown[]>(_args?: unknown): {
  data: T | undefined;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  return {
    data: undefined,
    isLoading: false,
    refetch: async () => undefined,
  };
}

export function useWriteContract(): {
  writeContract: (...args: unknown[]) => void;
  writeContractAsync: (...args: unknown[]) => Promise<`0x${string}`>;
  data: `0x${string}` | undefined;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  reset: () => void;
} {
  const fail = () => {
    throw new Error(
      "EVM contract writes are no longer supported — protocol has migrated to Solana. " +
        "Use lib/vista-actions.ts (Anchor program calls) instead.",
    );
  };
  return {
    writeContract: () => fail(),
    writeContractAsync: async () => fail(),
    data: undefined,
    isPending: false,
    isSuccess: false,
    error: null,
    reset: () => {},
  };
}

export function useWaitForTransactionReceipt(_args?: unknown): {
  data: unknown;
  isLoading: boolean;
  isSuccess: boolean;
} {
  return {
    data: undefined,
    isLoading: false,
    isSuccess: false,
  };
}

export function useChainId(): number {
  return 0;
}

export function useSwitchChain(): {
  switchChainAsync: (args: { chainId: number }) => Promise<void>;
} {
  return {
    switchChainAsync: async () => undefined,
  };
}

/** viem's `formatEther` shim — returns "0" since the protocol no longer uses ETH. */
export function formatEther(_value: bigint | undefined | null): string {
  return "0";
}
