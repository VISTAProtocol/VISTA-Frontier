// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VistaEscrow
/// @notice Holds advertiser campaign deposits and routes payments per tick
contract VistaEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    struct Campaign {
        address advertiser;
        uint256 totalBudget;
        uint256 remainingBudget;
        uint256 ratePerSecond;
        uint256 duration;
        bool active;
        uint256 createdAt;
    }

    IERC20 public immutable usdc;
    address public authorizedStream;

    mapping(bytes32 => Campaign) public campaigns;

    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed advertiser,
        uint256 amount,
        uint256 ratePerSecond
    );
    event CampaignEnded(bytes32 indexed campaignId, uint256 refundedAmount);
    event AuthorizedStreamSet(address indexed stream);

    modifier onlyStream() {
        require(msg.sender == authorizedStream, "VistaEscrow: not authorized stream");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "VistaEscrow: zero usdc address");
        usdc = IERC20(_usdc);
    }

    /// @notice Deposits mUSDC to fund a campaign
    /// @param campaignId Unique campaign identifier (keccak256 hash)
    /// @param amount Total budget in mUSDC (6 decimals)
    /// @param ratePerSecond Payment rate in mUSDC per viewer per second
    /// @param duration Expected campaign duration in seconds
    function deposit(
        bytes32 campaignId,
        uint256 amount,
        uint256 ratePerSecond,
        uint256 duration
    ) external {
        require(campaigns[campaignId].advertiser == address(0), "VistaEscrow: campaign already exists");
        require(amount > 0, "VistaEscrow: zero amount");
        require(ratePerSecond > 0, "VistaEscrow: zero rate");
        require(duration > 0, "VistaEscrow: zero duration");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        campaigns[campaignId] = Campaign({
            advertiser: msg.sender,
            totalBudget: amount,
            remainingBudget: amount,
            ratePerSecond: ratePerSecond,
            duration: duration,
            active: true,
            createdAt: block.timestamp
        });

        emit CampaignCreated(campaignId, msg.sender, amount, ratePerSecond);
    }

    /// @notice Deducts campaign budget and routes tokens to vault and vistaWallet
    /// @dev Replaces the accounting-only deductBudget to physically move tokens atomically
    /// @param campaignId Campaign to deduct from
    /// @param totalAmount Total mUSDC to deduct from budget
    /// @param vault VistaVault address to receive user+publisher share
    /// @param vaultAmount mUSDC amount to transfer to vault (user + publisher combined)
    /// @param vistaWallet_ Address that receives VISTA protocol fee directly
    /// @param vistaAmount mUSDC amount to transfer to vistaWallet
    function payout(
        bytes32 campaignId,
        uint256 totalAmount,
        address vault,
        uint256 vaultAmount,
        address vistaWallet_,
        uint256 vistaAmount
    ) external onlyStream {
        Campaign storage c = campaigns[campaignId];
        require(c.active, "VistaEscrow: campaign not active");
        require(c.remainingBudget >= totalAmount, "VistaEscrow: insufficient budget");
        require(vaultAmount + vistaAmount == totalAmount, "VistaEscrow: amount mismatch");

        c.remainingBudget -= totalAmount;
        if (c.remainingBudget == 0) {
            c.active = false;
        }

        usdc.safeTransfer(vault, vaultAmount);
        usdc.safeTransfer(vistaWallet_, vistaAmount);
    }

    /// @notice Refunds remaining campaign budget to the advertiser and ends the campaign
    /// @param campaignId Campaign to refund
    function refundRemaining(bytes32 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        require(msg.sender == c.advertiser, "VistaEscrow: not advertiser");
        require(c.active, "VistaEscrow: campaign not active");
        require(c.remainingBudget > 0, "VistaEscrow: nothing to refund");

        // CEI: zero state before external call
        uint256 refund = c.remainingBudget;
        c.remainingBudget = 0;
        c.active = false;

        usdc.safeTransfer(c.advertiser, refund);
        emit CampaignEnded(campaignId, refund);
    }

    /// @notice Returns full Campaign struct for a given campaignId
    /// @param campaignId Campaign identifier
    /// @return Campaign memory struct
    function getCampaign(bytes32 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    /// @notice Sets the authorized stream contract address
    /// @param stream Address of the VistaStream contract
    function setAuthorizedStream(address stream) external onlyOwner {
        require(stream != address(0), "VistaEscrow: zero address");
        authorizedStream = stream;
        emit AuthorizedStreamSet(stream);
    }
}
