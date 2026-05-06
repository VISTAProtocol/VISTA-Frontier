// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Testnet ERC-20 simulating USDC with 6 decimals
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    /// @notice Returns 6 decimals to match real USDC
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Permissionless mint — testnet only, no access control
    /// @param to Recipient address
    /// @param amount Amount of mUSDC to mint (6 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
