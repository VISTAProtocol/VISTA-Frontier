// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VistaReceipt
/// @notice Soulbound ERC-1155 NFT minted at the end of every verified attention session
contract VistaReceipt is ERC1155, Ownable {
    struct Receipt {
        bytes32 sessionId;
        address userWallet;
        address advertiserWallet;
        bytes32 campaignId;
        address publisherWallet;
        uint256 secondsVerified;
        uint256 usdcPaid;
        uint256 timestamp;
    }

    uint256 private _tokenIdCounter;
    address public authorizedStream;

    mapping(uint256 => Receipt) public receipts;
    mapping(address => uint256[]) private userTokens;
    mapping(bytes32 => uint256[]) private campaignTokens;

    event ReceiptMinted(
        address indexed user,
        uint256 indexed tokenId,
        bytes32 indexed sessionId,
        bytes32 campaignId,
        uint256 secondsVerified,
        uint256 usdcPaid
    );
    event AuthorizedStreamSet(address indexed stream);

    modifier onlyStream() {
        require(msg.sender == authorizedStream, "VistaReceipt: not authorized stream");
        _;
    }

    constructor() ERC1155("") Ownable(msg.sender) {}

    /// @notice Soulbound: all transfers are permanently disabled
    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert("VistaReceipt: soulbound");
    }

    /// @notice Soulbound: all batch transfers are permanently disabled
    function safeBatchTransferFrom(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override {
        revert("VistaReceipt: soulbound");
    }

    /// @notice Mints a session receipt NFT to the viewer
    /// @param user Viewer wallet that watched the ad
    /// @param sessionId Unique session identifier
    /// @param campaignId Campaign associated with this session
    /// @param advertiser Advertiser wallet that funded the campaign
    /// @param publisher Publisher platform wallet
    /// @param secondsVerified Total verified attention seconds
    /// @param usdcPaid Total mUSDC paid out for this session
    /// @return tokenId The newly minted token ID
    function mint(
        address user,
        bytes32 sessionId,
        bytes32 campaignId,
        address advertiser,
        address publisher,
        uint256 secondsVerified,
        uint256 usdcPaid
    ) external onlyStream returns (uint256 tokenId) {
        tokenId = _tokenIdCounter++;

        _mint(user, tokenId, 1, "");

        receipts[tokenId] = Receipt({
            sessionId: sessionId,
            userWallet: user,
            advertiserWallet: advertiser,
            campaignId: campaignId,
            publisherWallet: publisher,
            secondsVerified: secondsVerified,
            usdcPaid: usdcPaid,
            timestamp: block.timestamp
        });

        userTokens[user].push(tokenId);
        campaignTokens[campaignId].push(tokenId);

        emit ReceiptMinted(user, tokenId, sessionId, campaignId, secondsVerified, usdcPaid);
    }

    /// @notice Returns the full receipt metadata for a token
    /// @param tokenId Token ID to query
    /// @return Receipt memory struct
    function getReceipt(uint256 tokenId) external view returns (Receipt memory) {
        return receipts[tokenId];
    }

    /// @notice Returns all token IDs owned by a user
    /// @param user Address to query
    /// @return Array of token IDs
    function getReceiptsByUser(address user) external view returns (uint256[] memory) {
        return userTokens[user];
    }

    /// @notice Returns all token IDs associated with a campaign
    /// @param campaignId Campaign to query
    /// @return Array of token IDs
    function getCampaignReceipts(bytes32 campaignId) external view returns (uint256[] memory) {
        return campaignTokens[campaignId];
    }

    /// @notice Sets the authorized stream contract address
    /// @param stream Address of the VistaStream contract
    function setAuthorizedStream(address stream) external onlyOwner {
        require(stream != address(0), "VistaReceipt: zero address");
        authorizedStream = stream;
        emit AuthorizedStreamSet(stream);
    }
}
