// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IVistaEscrow {
    struct Campaign {
        address advertiser;
        uint256 totalBudget;
        uint256 remainingBudget;
        uint256 ratePerSecond;
        uint256 duration;
        bool active;
        uint256 createdAt;
    }

    function getCampaign(bytes32 campaignId) external view returns (Campaign memory);

    function payout(
        bytes32 campaignId,
        uint256 totalAmount,
        address vault,
        uint256 vaultAmount,
        address vistaWallet_,
        uint256 vistaAmount
    ) external;
}

interface IVistaVault {
    function credit(
        address wallet,
        bytes32 sessionId,
        bytes32 campaignId,
        address publisherWallet,
        uint256 amount,
        uint8 role
    ) external;
}

interface IVistaReceipt {
    function mint(
        address user,
        bytes32 sessionId,
        bytes32 campaignId,
        address advertiser,
        address publisher,
        uint256 secondsVerified,
        uint256 usdcPaid
    ) external returns (uint256);
}

/// @title VistaStream
/// @notice Core payment engine — called by Oracle every 5 seconds when attention is verified
contract VistaStream is Ownable {
    struct Session {
        bytes32 sessionId;
        bytes32 campaignId;
        address userWallet;
        address publisherWallet;
        uint256 secondsVerified;
        uint256 totalPaid;
        bool active;
        uint256 startedAt;
    }

    address public authorizedOracle;
    address public vistaWallet;
    IVistaEscrow public escrowContract;
    IVistaVault public vaultContract;
    IVistaReceipt public receiptContract;

    // Revenue split constants (out of 100)
    uint256 private constant USER_PCT = 40;
    uint256 private constant PUBLISHER_PCT = 50;

    mapping(bytes32 => Session) public sessions;

    event StreamStarted(
        bytes32 indexed sessionId,
        bytes32 indexed campaignId,
        address indexed userWallet,
        address publisherWallet
    );
    event StreamTick(
        bytes32 indexed sessionId,
        address userWallet,
        address publisherWallet,
        uint256 totalAmount,
        uint256 userAmount,
        uint256 publisherAmount,
        uint256 timestamp
    );
    event StreamEnded(
        bytes32 indexed sessionId,
        uint256 secondsVerified,
        uint256 totalPaid
    );
    event AuthorizedOracleSet(address indexed oracle);
    event ContractAddressesSet(address escrow, address vault, address receipt);

    modifier onlyOracle() {
        require(msg.sender == authorizedOracle, "VistaStream: not oracle");
        _;
    }

    constructor(
        address _escrow,
        address _vault,
        address _receipt,
        address _oracle,
        address _vistaWallet
    ) Ownable(msg.sender) {
        require(_escrow != address(0), "VistaStream: zero escrow");
        require(_vault != address(0), "VistaStream: zero vault");
        require(_receipt != address(0), "VistaStream: zero receipt");
        require(_oracle != address(0), "VistaStream: zero oracle");
        require(_vistaWallet != address(0), "VistaStream: zero vistaWallet");

        escrowContract = IVistaEscrow(_escrow);
        vaultContract = IVistaVault(_vault);
        receiptContract = IVistaReceipt(_receipt);
        authorizedOracle = _oracle;
        vistaWallet = _vistaWallet;
    }

    /// @notice Registers a new attention session for a user on a campaign
    /// @param sessionId Unique session identifier
    /// @param campaignId Campaign being watched
    /// @param userWallet End user wallet earning rewards
    /// @param publisherWallet Publisher platform wallet earning revenue share
    function startStream(
        bytes32 sessionId,
        bytes32 campaignId,
        address userWallet,
        address publisherWallet
    ) external onlyOracle {
        require(sessions[sessionId].startedAt == 0, "VistaStream: session already exists");
        require(userWallet != address(0), "VistaStream: zero userWallet");
        require(publisherWallet != address(0), "VistaStream: zero publisherWallet");

        IVistaEscrow.Campaign memory campaign = escrowContract.getCampaign(campaignId);
        require(campaign.advertiser != address(0), "VistaStream: campaign not found");
        require(campaign.active, "VistaStream: campaign not active");

        sessions[sessionId] = Session({
            sessionId: sessionId,
            campaignId: campaignId,
            userWallet: userWallet,
            publisherWallet: publisherWallet,
            secondsVerified: 0,
            totalPaid: 0,
            active: true,
            startedAt: block.timestamp
        });

        emit StreamStarted(sessionId, campaignId, userWallet, publisherWallet);
    }

    /// @notice Processes a payment tick for verified attention seconds
    /// @dev Splits totalAmount 50/40/10 between user vault, publisher vault, and vistaWallet
    /// @param sessionId Session to tick
    /// @param secondsElapsed Verified attention seconds since last tick
    function tickStream(bytes32 sessionId, uint256 secondsElapsed) external onlyOracle {
        Session storage session = sessions[sessionId];
        require(session.active, "VistaStream: session not active");
        require(secondsElapsed > 0, "VistaStream: zero seconds");

        IVistaEscrow.Campaign memory campaign = escrowContract.getCampaign(session.campaignId);
        require(campaign.active, "VistaStream: campaign exhausted");

        uint256 totalAmount = campaign.ratePerSecond * secondsElapsed;
        require(campaign.remainingBudget >= totalAmount, "VistaStream: insufficient budget");

        // 40/50/10 split — vistaAmount uses remainder to absorb integer dust
        uint256 userAmount = (totalAmount * USER_PCT) / 100;
        uint256 publisherAmount = (totalAmount * PUBLISHER_PCT) / 100;
        uint256 vistaAmount = totalAmount - userAmount - publisherAmount;

        // Move tokens: escrow → vault (user+publisher), escrow → vistaWallet
        escrowContract.payout(
            session.campaignId,
            totalAmount,
            address(vaultContract),
            userAmount + publisherAmount,
            vistaWallet,
            vistaAmount
        );

        // Update vault accounting balances
        vaultContract.credit(
            session.userWallet,
            sessionId,
            session.campaignId,
            session.publisherWallet,
            userAmount,
            0 // role: user
        );
        vaultContract.credit(
            session.publisherWallet,
            sessionId,
            session.campaignId,
            session.publisherWallet,
            publisherAmount,
            1 // role: publisher
        );

        session.secondsVerified += secondsElapsed;
        session.totalPaid += totalAmount;

        emit StreamTick(
            sessionId,
            session.userWallet,
            session.publisherWallet,
            totalAmount,
            userAmount,
            publisherAmount,
            block.timestamp
        );
    }

    /// @notice Ends a session and mints a soulbound receipt NFT to the viewer
    /// @param sessionId Session to end
    function endStream(bytes32 sessionId) external onlyOracle {
        Session storage session = sessions[sessionId];
        require(session.active, "VistaStream: session not active");

        session.active = false;

        IVistaEscrow.Campaign memory campaign = escrowContract.getCampaign(session.campaignId);

        receiptContract.mint(
            session.userWallet,
            sessionId,
            session.campaignId,
            campaign.advertiser,
            session.publisherWallet,
            session.secondsVerified,
            session.totalPaid
        );

        emit StreamEnded(sessionId, session.secondsVerified, session.totalPaid);
    }

    /// @notice Updates the authorized oracle address
    /// @param oracle New oracle address
    function setAuthorizedOracle(address oracle) external onlyOwner {
        require(oracle != address(0), "VistaStream: zero address");
        authorizedOracle = oracle;
        emit AuthorizedOracleSet(oracle);
    }

    /// @notice Updates the dependent contract addresses
    /// @param escrow New VistaEscrow address
    /// @param vault New VistaVault address
    /// @param receipt New VistaReceipt address
    function setContractAddresses(address escrow, address vault, address receipt) external onlyOwner {
        require(escrow != address(0) && vault != address(0) && receipt != address(0), "VistaStream: zero address");
        escrowContract = IVistaEscrow(escrow);
        vaultContract = IVistaVault(vault);
        receiptContract = IVistaReceipt(receipt);
        emit ContractAddressesSet(escrow, vault, receipt);
    }
}
