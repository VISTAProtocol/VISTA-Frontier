# Vista Bridge PoC

This document outlines the cross-chain reward claim flow using LayerZero V2.

## Contracts
- `VistaToken.sol` — ERC20 reward token (6 decimals), mint/burn by owner.
- `VistaBridgeSender.sol` — LayerZero V2 sender called by `VistaVault`.
- `VistaBridgeReceiver.sol` — LayerZero V2 receiver that mints `VistaToken`.
- `VistaVault.sol` — adds `requestBridgeClaim()` and `quoteBridgeClaim()`.

## Claim ID
`claimId = keccak256(receiptTokenId, dstEid)`

## Flow
1. User calls `quoteBridgeClaim()` to get LZ fee (paid by user).
2. User calls `requestBridgeClaim()` with receipt token ID and destination chain.
3. `VistaVault` checks receipt ownership, locks balance, and sends LZ message.
4. `VistaBridgeReceiver` validates sender and mints Vista token on destination.

## Solana
See `Solana-Program/` for the PoC program scaffold.

## Implementation stages
1. Deploy VistaToken + BridgeSender + BridgeReceiver on EVM chains.
2. Wire VistaVault bridge claim flow and set trusted senders/receivers.
3. Deploy Solana program + SPL mint and set mint authority.
4. Integrate LayerZero V2 Solana adapter to invoke the claim instruction.

## MVP smoke test (EVM)
1. Mint a receipt by completing a session so the user has a receipt token ID.
2. Call `quoteBridgeClaim(receiptTokenId, dstEid, receiver, options)`.
3. Call `requestBridgeClaim()` with `msg.value = nativeFee`.
4. On destination, verify `VistaBridgeReceiver` minted Vista tokens.
