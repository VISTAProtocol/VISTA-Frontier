// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VistaVault
/// @notice Holds earnings for users and publishers; they withdraw manually
contract VistaVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    struct EarningRecord {
        bytes32 sessionId;
        address publisherWallet;
        bytes32 campaignId;
        uint256 amount;
        uint8 role; // 0 = user, 1 = publisher
        uint256 timestamp;
    }

    IERC20 public immutable usdc;
    address public authorizedStream;

    mapping(address => uint256) public balances;
    mapping(address => EarningRecord[]) private earningRecords;

    event Credited(
        address indexed wallet,
        bytes32 indexed sessionId,
        bytes32 indexed campaignId,
        uint256 amount,
        uint8 role
    );
    event Withdrawn(address indexed wallet, uint256 amount);
    event AuthorizedStreamSet(address indexed stream);

    modifier onlyStream() {
        require(msg.sender == authorizedStream, "VistaVault: not authorized stream");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "VistaVault: zero usdc address");
        usdc = IERC20(_usdc);
    }

    /// @notice Credits earnings to a wallet and records the earning history
    /// @param wallet Recipient wallet address
    /// @param sessionId Session that generated this earning
    /// @param campaignId Campaign associated with this earning
    /// @param publisherWallet Publisher platform wallet (stored for user records too)
    /// @param amount mUSDC amount credited (6 decimals)
    /// @param role 0 for end user, 1 for publisher
    function credit(
        address wallet,
        bytes32 sessionId,
        bytes32 campaignId,
        address publisherWallet,
        uint256 amount,
        uint8 role
    ) external onlyStream {
        require(wallet != address(0), "VistaVault: zero wallet");
        require(amount > 0, "VistaVault: zero amount");

        balances[wallet] += amount;
        earningRecords[wallet].push(
            EarningRecord({
                sessionId: sessionId,
                publisherWallet: publisherWallet,
                campaignId: campaignId,
                amount: amount,
                role: role,
                timestamp: block.timestamp
            })
        );

        emit Credited(wallet, sessionId, campaignId, amount, role);
    }

    /// @notice Withdraws all accumulated mUSDC earnings to the caller's wallet
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "VistaVault: nothing to withdraw");

        // CEI: zero balance before external call
        balances[msg.sender] = 0;

        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Returns the withdrawable mUSDC balance for a wallet
    /// @param wallet Address to query
    /// @return Current balance in mUSDC (6 decimals)
    function getBalance(address wallet) external view returns (uint256) {
        return balances[wallet];
    }

    /// @notice Returns the full earning history for a wallet
    /// @param wallet Address to query
    /// @return Array of EarningRecord structs
    function getEarningRecords(address wallet) external view returns (EarningRecord[] memory) {
        return earningRecords[wallet];
    }

    /// @notice Sets the authorized stream contract address
    /// @param stream Address of the VistaStream contract
    function setAuthorizedStream(address stream) external onlyOwner {
        require(stream != address(0), "VistaVault: zero address");
        authorizedStream = stream;
        emit AuthorizedStreamSet(stream);
    }
}
