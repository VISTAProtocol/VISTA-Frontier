// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenMessenger} from "./interfaces/ITokenMessenger.sol";

/// @title VistaGateway
/// @notice Advertiser deposit gateway: locks USDC on an EVM chain, burns it
///         via Circle CCTP for native mint on Solana, and emits campaign
///         metadata as an event. Same contract is deployed on each
///         supported EVM chain.
///
/// @dev    Trusted-relayer model — no LayerZero on the EVM side. The VISTA
///         oracle node tails `CampaignBridged` and submits the metadata to
///         `vista_bridge` on Solana. Skipping LZ V2 wiring (DVN, executor,
///         peer config per route) is a deliberate hackathon shortcut; the
///         metadata channel is small (a few u64s + bytes32 ids) and can be
///         carried out-of-band without losing trust properties because
///         CCTP is the part that actually moves USDC.
contract VistaGateway is Ownable {
    using SafeERC20 for IERC20;

    // ───────────────────────── Immutables ─────────────────────────

    address public immutable TOKEN_MESSENGER;
    address public immutable USDC;

    /// Circle CCTP destination domain id for Solana = 5 on both mainnet
    /// and testnet.
    uint32 public constant SOLANA_DOMAIN = 5;

    // ───────────────────────── Storage ─────────────────────────

    struct Campaign {
        bytes32 campaignId;
        address advertiser;
        uint256 totalBudget;
        uint64 ratePerSecond;
        uint64 duration;
        uint64 cctpNonce;
        uint64 createdAt;
    }

    mapping(bytes32 => Campaign) public campaigns;

    // ───────────────────────── Events ─────────────────────────

    /// Emitted after a successful CCTP burn. Oracle-node indexes this and
    /// relays the metadata to vista_bridge on Solana.
    event CampaignBridged(
        bytes32 indexed campaignId,
        address indexed advertiser,
        uint256 totalBudget,
        uint64 ratePerSecond,
        uint64 duration,
        uint64 cctpNonce,
        uint32 sourceChainId,
        bytes32 solanaCampaignVault
    );

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAmount();
    error ZeroRate();
    error ZeroDuration();
    error CampaignAlreadyExists();

    // ───────────────────────── Constructor ─────────────────────────

    constructor(
        address _owner,
        address _tokenMessenger,
        address _usdc
    ) Ownable(_owner) {
        TOKEN_MESSENGER = _tokenMessenger;
        USDC = _usdc;
    }

    // ─────────────────────── Deposit campaign ───────────────────────

    /// @notice Pull USDC, burn it via CCTP for Solana, emit metadata.
    /// @param solanaCampaignVault MUST be the bytes32 form of the per-campaign
    ///        vault PDA on `vista_bridge` (seeds: ["xchain_vault", campaignId]).
    ///        The dashboard derives this; passing anything else will route
    ///        the USDC to a non-existent owner that's recoverable only via
    ///        Circle support.
    function depositCampaign(
        bytes32 campaignId,
        uint256 totalBudget,
        uint64 ratePerSecond,
        uint64 duration,
        bytes32 solanaCampaignVault
    ) external {
        if (totalBudget == 0) revert ZeroAmount();
        if (ratePerSecond == 0) revert ZeroRate();
        if (duration == 0) revert ZeroDuration();
        if (campaigns[campaignId].advertiser != address(0)) {
            revert CampaignAlreadyExists();
        }

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalBudget);

        IERC20(USDC).forceApprove(TOKEN_MESSENGER, totalBudget);
        uint64 cctpNonce = ITokenMessenger(TOKEN_MESSENGER).depositForBurn(
            totalBudget,
            SOLANA_DOMAIN,
            solanaCampaignVault,
            USDC
        );

        campaigns[campaignId] = Campaign({
            campaignId: campaignId,
            advertiser: msg.sender,
            totalBudget: totalBudget,
            ratePerSecond: ratePerSecond,
            duration: duration,
            cctpNonce: cctpNonce,
            createdAt: uint64(block.timestamp)
        });

        emit CampaignBridged(
            campaignId,
            msg.sender,
            totalBudget,
            ratePerSecond,
            duration,
            cctpNonce,
            uint32(block.chainid),
            solanaCampaignVault
        );
    }
}
