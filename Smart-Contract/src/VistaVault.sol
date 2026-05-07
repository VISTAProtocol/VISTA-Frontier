// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./LayerZeroV2Interfaces.sol";

struct ReceiptData {
    bytes32 sessionId;
    address userWallet;
    address advertiserWallet;
    bytes32 campaignId;
    address publisherWallet;
    uint256 secondsVerified;
    uint256 usdcPaid;
    uint256 timestamp;
}

interface IVistaReceipt {
    function getReceipt(uint256 tokenId) external view returns (ReceiptData memory);
}

interface IBridgeSender {
    function quoteFee(
        uint32 dstEid,
        bytes32 receiver,
        bytes32 claimId,
        address user,
        uint256 amount,
        bytes calldata options
    ) external view returns (ILayerZeroEndpointV2.MessagingFee memory fee);

    function sendClaim(
        uint32 dstEid,
        bytes32 receiver,
        bytes32 claimId,
        address user,
        uint256 amount,
        bytes calldata options,
        address refundAddress
    ) external payable returns (ILayerZeroEndpointV2.MessagingReceipt memory receipt);
}

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
    address public receiptContract;
    address public bridgeSender;

    uint256 private constant USER_PCT = 40;

    mapping(address => uint256) public balances;
    mapping(address => EarningRecord[]) private earningRecords;
    mapping(bytes32 => bool) public bridgeClaims;

    event Credited(
        address indexed wallet,
        bytes32 indexed sessionId,
        bytes32 indexed campaignId,
        uint256 amount,
        uint8 role
    );
    event Withdrawn(address indexed wallet, uint256 amount);
    event AuthorizedStreamSet(address indexed stream);
    event ReceiptContractSet(address indexed receipt);
    event BridgeSenderSet(address indexed bridgeSender);
    event BridgeClaimRequested(
        bytes32 indexed claimId,
        uint256 indexed receiptTokenId,
        uint32 indexed dstEid,
        bytes32 receiver,
        uint256 amount
    );

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

    function setReceiptContract(address receipt) external onlyOwner {
        require(receipt != address(0), "VistaVault: zero receipt");
        receiptContract = receipt;
        emit ReceiptContractSet(receipt);
    }

    function setBridgeSender(address sender) external onlyOwner {
        require(sender != address(0), "VistaVault: zero sender");
        bridgeSender = sender;
        emit BridgeSenderSet(sender);
    }

    function quoteBridgeClaim(
        uint256 receiptTokenId,
        uint32 dstEid,
        bytes32 receiver,
        bytes calldata options
    ) external view returns (ILayerZeroEndpointV2.MessagingFee memory fee) {
        require(bridgeSender != address(0), "VistaVault: bridge sender not set");
        require(receiptContract != address(0), "VistaVault: receipt not set");

        ReceiptData memory receipt = IVistaReceipt(receiptContract).getReceipt(receiptTokenId);
        require(receipt.userWallet == msg.sender, "VistaVault: not receipt owner");
        uint256 amount = (receipt.usdcPaid * USER_PCT) / 100;
        bytes32 claimId = keccak256(abi.encodePacked(receiptTokenId, dstEid));

        fee = IBridgeSender(bridgeSender).quoteFee(
            dstEid,
            receiver,
            claimId,
            msg.sender,
            amount,
            options
        );
    }

    function requestBridgeClaim(
        uint256 receiptTokenId,
        uint32 dstEid,
        bytes32 receiver,
        bytes calldata options
    ) external payable nonReentrant {
        require(bridgeSender != address(0), "VistaVault: bridge sender not set");
        require(receiptContract != address(0), "VistaVault: receipt not set");

        ReceiptData memory receipt = IVistaReceipt(receiptContract).getReceipt(receiptTokenId);
        require(receipt.userWallet == msg.sender, "VistaVault: not receipt owner");

        bytes32 claimId = keccak256(abi.encodePacked(receiptTokenId, dstEid));
        require(!bridgeClaims[claimId], "VistaVault: already claimed");

        uint256 amount = (receipt.usdcPaid * USER_PCT) / 100;
        require(amount > 0, "VistaVault: zero amount");
        require(balances[msg.sender] >= amount, "VistaVault: insufficient balance");

        balances[msg.sender] -= amount;
        bridgeClaims[claimId] = true;

        IBridgeSender(bridgeSender).sendClaim{ value: msg.value }(
            dstEid,
            receiver,
            claimId,
            msg.sender,
            amount,
            options,
            msg.sender
        );

        emit BridgeClaimRequested(claimId, receiptTokenId, dstEid, receiver, amount);
    }
}
