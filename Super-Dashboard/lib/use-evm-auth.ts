"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { fetchJson } from "@/lib/http";

/**
 * Per-(EVM)-wallet JWT storage. Mirrors the `vista.jwt:<wallet>` pattern so
 * a user can be signed in as both Solana and EVM identities in the same
 * browser without one stomping the other.
 */
const JWT_KEY_PREFIX = "vista.jwt.evm:";

function jwtKeyFor(addr: string) {
  return `${JWT_KEY_PREFIX}${addr.toLowerCase()}`;
}

export interface EvmAuth {
  /** EVM address from wagmi useAccount, or undefined if not connected. */
  address: `0x${string}` | undefined;
  /** Issued JWT for the connected EVM address, or null if not signed in. */
  token: string | null;
  /** True while a sign-in request is in flight. */
  signingIn: boolean;
  /** Error message from the last sign-in attempt. */
  error: string | null;
  /** Trigger SIWE flow: GET challenge → personal_sign → POST verify → store JWT. */
  signIn: () => Promise<string | null>;
  /** Drop the JWT for the current address (does NOT disconnect MetaMask). */
  signOut: () => void;
}

/**
 * EVM-side companion to /api/auth/{evm-challenge,evm-verify}. Issues a JWT
 * carrying { walletAddress, walletType: "evm" } that downstream advertiser
 * routes use to scope queries to advertiser_evm_address.
 */
export function useEvmAuth(): EvmAuth {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore token whenever the connected address changes — switching
  // accounts in MetaMask should NOT silently inherit the previous token.
  useEffect(() => {
    if (typeof window === "undefined" || !address) {
      setToken(null);
      return;
    }
    setToken(window.localStorage.getItem(jwtKeyFor(address)));
  }, [address]);

  const signIn = useCallback(async (): Promise<string | null> => {
    if (!address) {
      setError("Connect an EVM wallet first.");
      return null;
    }
    setError(null);
    setSigningIn(true);
    try {
      const { message } = await fetchJson<{ message: string; nonce: string }>(
        `/api/auth/evm-challenge?address=${address}`,
      );
      const signature = await signMessageAsync({ message });
      const result = await fetchJson<{
        token: string;
        walletAddress: string;
        walletType: "evm";
      }>("/api/auth/evm-verify", {
        method: "POST",
        body: JSON.stringify({ address, message, signature }),
      });
      window.localStorage.setItem(jwtKeyFor(address), result.token);
      setToken(result.token);
      return result.token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed.";
      setError(msg);
      return null;
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessageAsync]);

  const signOut = useCallback(() => {
    if (!address || typeof window === "undefined") return;
    window.localStorage.removeItem(jwtKeyFor(address));
    setToken(null);
  }, [address]);

  return { address, token, signingIn, error, signIn, signOut };
}
