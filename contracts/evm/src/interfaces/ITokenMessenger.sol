// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Minimal Circle CCTP TokenMessenger interface — only the burn entry
/// point we need from `VistaGateway`. The full interface is much larger but
/// pinning it here insulates us from CCTP package upgrades.
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);
}
