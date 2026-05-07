// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, MessagingFee, Origin} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenMessenger} from "./interfaces/ITokenMessenger.sol";

/// @title VistaGateway
/// @notice One-way advertiser deposit gateway: locks USDC on an EVM chain,
///         burns it via Circle CCTP for Solana mint, and ships campaign
///         metadata over LayerZero V2 to `vista_bridge` on Solana. Same
///         contract is deployed on each supported EVM chain (Base Sepolia,
///         Arbitrum Sepolia for the hackathon).
/// @dev    Receive-side is unused — Solana → EVM messaging is not part of
///         the VISTA flow. `_lzReceive` reverts to make any spurious inbound
///         messages obvious instead of silently swallowed.
contract VistaGateway is OApp {
    using SafeERC20 for IERC20;

    // ───────────────────────── Immutables ─────────────────────────

    /// Circle CCTP TokenMessenger on this chain.
    address public immutable TOKEN_MESSENGER;
    /// Native USDC on this chain.
    address public immutable USDC;

    // Circle CCTP destination domain for Solana = 5 (mainnet & testnet).
    uint32 public constant SOLANA_DOMAIN = 5;

    /// LayerZero V2 endpoint id for the Solana side. Owner-settable so we
    /// can flip between devnet (40168) and mainnet without redeploying.
    uint32 public solanaEid;

    // ───────────────────────── Storage ─────────────────────────

    /// `bytes32` (left-padded Solana pubkey) of the per-campaign vault PDA on
    /// vista_bridge. Computed off-chain as
    ///   PDA([b"xchain_vault", campaign_id], vista_bridge_program_id)
    /// then passed in by the caller for each `depositCampaign`. We don't
    /// derive it here (no ed25519/PDA primitives in EVM) — the caller is
    /// trusted to provide the correct one. If wrong, USDC ends up at a
    /// nonexistent recipient and is recoverable only by Circle support, so
    /// the dashboard MUST derive it deterministically and never accept user
    /// input for this field.

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

    event SolanaEidSet(uint32 newEid);

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAmount();
    error ZeroRate();
    error ZeroDuration();
    error CampaignAlreadyExists();
    error InboundDisabled();

    // ───────────────────────── Constructor ─────────────────────────

    constructor(
        address _endpoint,
        address _owner,
        address _tokenMessenger,
        address _usdc,
        uint32 _solanaEid
    ) OApp(_endpoint, _owner) {
        TOKEN_MESSENGER = _tokenMessenger;
        USDC = _usdc;
        solanaEid = _solanaEid;
    }

    // ───────────────────────── Admin ─────────────────────────

    function setSolanaEid(uint32 newEid) external onlyOwner {
        solanaEid = newEid;
        emit SolanaEidSet(newEid);
    }

    // ───────────────────── Quote LayerZero fee ─────────────────────

    /// @notice Quote the native fee LayerZero will charge for the metadata
    /// message that accompanies a deposit. The dashboard calls this before
    /// `depositCampaign` so the user sees an accurate ETH amount.
    function quoteLzFee(
        bytes32 campaignId,
        address advertiser,
        uint256 totalBudget,
        uint64 ratePerSecond,
        uint64 duration,
        bytes calldata lzOptions
    ) external view returns (MessagingFee memory) {
        bytes memory payload = abi.encode(
            campaignId,
            advertiser,
            totalBudget,
            ratePerSecond,
            duration,
            uint64(0) // cctp nonce unknown until burn — quote ignores it
        );
        return _quote(solanaEid, payload, lzOptions, false);
    }

    // ─────────────────────── Deposit campaign ───────────────────────

    /// @notice Pull USDC from advertiser, burn it via CCTP for Solana mint,
    /// and ship campaign metadata via LayerZero. Requires:
    ///   - `IERC20(USDC).approve(address(this), totalBudget)` first
    ///   - `msg.value` >= LZ fee (call `quoteLzFee` to size it)
    /// @param solanaCampaignVault bytes32-encoded Solana PDA receiving USDC.
    ///        MUST be derived by the dashboard as
    ///        PDA([b"xchain_vault", campaignId], vista_bridge_program_id).
    function depositCampaign(
        bytes32 campaignId,
        uint256 totalBudget,
        uint64 ratePerSecond,
        uint64 duration,
        bytes32 solanaCampaignVault,
        bytes calldata lzOptions
    ) external payable {
        if (totalBudget == 0) revert ZeroAmount();
        if (ratePerSecond == 0) revert ZeroRate();
        if (duration == 0) revert ZeroDuration();
        if (campaigns[campaignId].advertiser != address(0)) {
            revert CampaignAlreadyExists();
        }

        // 1. Pull USDC from advertiser.
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalBudget);

        // 2. Approve TokenMessenger and burn for Solana.
        IERC20(USDC).forceApprove(TOKEN_MESSENGER, totalBudget);
        uint64 cctpNonce = ITokenMessenger(TOKEN_MESSENGER).depositForBurn(
            totalBudget,
            SOLANA_DOMAIN,
            solanaCampaignVault,
            USDC
        );

        // 3. Ship metadata over LayerZero. Solana side validates against
        //    the CCTP-minted balance before activating the campaign.
        bytes memory payload = abi.encode(
            campaignId,
            msg.sender,
            totalBudget,
            ratePerSecond,
            duration,
            cctpNonce
        );
        _lzSend(
            solanaEid,
            payload,
            lzOptions,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
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

    // ───────────────────────── OApp receive ─────────────────────────

    /// @dev VistaGateway is send-only. Anything inbound is misconfiguration.
    function _lzReceive(
        Origin calldata,
        bytes32,
        bytes calldata,
        address,
        bytes calldata
    ) internal pure override {
        revert InboundDisabled();
    }
}
