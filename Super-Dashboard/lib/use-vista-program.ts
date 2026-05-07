"use client";

import { useMemo } from "react";
import {
  useAnchorWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import { Program } from "@coral-xyz/anchor";

import { getProvider, getVistaProgram } from "./anchor-client";
import type { VistaProtocol } from "./anchor/vista_protocol";

/**
 * Returns an Anchor program client bound to the connected wallet.
 * Returns null if no wallet is connected.
 */
export function useVistaProgram(): Program<VistaProtocol> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = getProvider(connection, wallet);
    return getVistaProgram(provider);
  }, [connection, wallet]);
}
