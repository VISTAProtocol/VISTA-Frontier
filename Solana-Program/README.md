# Vista Bridge (Solana)

PoC Solana program for minting Vista SPL rewards on LayerZero V2 message delivery.

## Notes
- This program expects the LayerZero V2 executor (or a trusted relayer) to be the SPL mint authority.
- The `claim` instruction uses a claim record PDA to prevent replay.
- Wire up LayerZero message verification at the runtime layer that invokes `claim`.

## LayerZero V2 adapter wiring (PoC)
1. Configure the Solana LayerZero executor to call `claim` with `(claim_id, amount)`.
2. Map the payload to `claim_id` (bytes32) + `amount` (u64).
3. Ensure the executor (or PDA) is the SPL mint authority.
4. Set receiver/trusted sender mappings on the EVM bridge contracts.

## Next steps
- Replace the placeholder program ID in Anchor.toml and lib.rs.
- Add LayerZero V2 Solana adapter integration for message verification.
- Create a dedicated mint authority PDA controlled by the program.
