"use client";

import { useMemo } from "react";
import {
  useAnchorWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import { Program } from "@coral-xyz/anchor";

import { getProvider } from "./anchor-client";
import { getOracleRegistryProgram } from "./oracle-actions";
import type { OracleRegistry } from "./anchor/oracle_registry";

/**
 * Returns an Anchor program client for `oracle_registry` bound to the
 * connected Solana wallet. Returns null if no wallet is connected.
 */
export function useOracleProgram(): Program<OracleRegistry> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = getProvider(connection, wallet);
    return getOracleRegistryProgram(provider);
  }, [connection, wallet]);
}
