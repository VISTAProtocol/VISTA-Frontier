# LayerZero V2 Solana Adapter Notes

PoC notes for wiring LayerZero V2 delivery to the `vista_bridge` program.

## Payload mapping
- `claim_id` = bytes32 (from EVM `keccak256(receiptTokenId, dstEid)`)
- `amount` = u64

## Execution
1. Configure the LayerZero executor to invoke `claim` on the program.
2. Pass the claimer wallet (destination user) as signer.
3. Set executor (or program PDA) as SPL mint authority.
4. Ensure replay protection via claim PDA is enforced.

## Security
- Validate the executor program ID in the adapter layer.
- Reject duplicate `claim_id` PDAs.
