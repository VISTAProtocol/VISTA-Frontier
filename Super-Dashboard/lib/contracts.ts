/**
 * EVM contract metadata — deprecated. The protocol has migrated to Solana
 * (see lib/solana.ts and lib/vista-actions.ts). This file exists only to
 * keep legacy imports compiling during the EVM→SVM transition. All ABIs
 * resolve to empty arrays and all addresses to null, so any page that
 * still calls into them via `useReadContract` / `useWriteContract` will
 * read empty data — pages should use Anchor reads or `/api/*` routes.
 *
 * TODO: delete this file once every page has been migrated to
 *       useVistaProgram / vista-actions.
 */

export const erc20Abi = [] as const;
export const vistaEscrowAbi = [] as const;
export const vistaStreamAbi = [] as const;
export const vistaVaultAbi = [] as const;

export const contractAddresses = {
  vistaStream: null,
  vistaEscrow: null,
  vistaVault: null,
  mockUsdc: null,
} as const;

export const hasContractConfig = false;
