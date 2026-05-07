// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LayerZeroV2Interfaces.sol";

/// @title VistaBridgeSender
/// @notice Sends LayerZero V2 messages to mint VistaToken on destination chains
contract VistaBridgeSender is Ownable {
    ILayerZeroEndpointV2 public immutable endpoint;
    address public authorizedVault;

    mapping(uint32 => bytes32) public trustedReceivers;

    event AuthorizedVaultSet(address indexed vault);
    event TrustedReceiverSet(uint32 indexed dstEid, bytes32 receiver);
    event ClaimSent(bytes32 indexed claimId, uint32 indexed dstEid, bytes32 receiver, uint256 amount);

    modifier onlyVault() {
        require(msg.sender == authorizedVault, "VistaBridgeSender: not authorized vault");
        _;
    }

    constructor(address _endpoint) Ownable(msg.sender) {
        require(_endpoint != address(0), "VistaBridgeSender: zero endpoint");
        endpoint = ILayerZeroEndpointV2(_endpoint);
    }

    function setAuthorizedVault(address vault) external onlyOwner {
        require(vault != address(0), "VistaBridgeSender: zero vault");
        authorizedVault = vault;
        emit AuthorizedVaultSet(vault);
    }

    function setTrustedReceiver(uint32 dstEid, bytes32 receiver) external onlyOwner {
        require(receiver != bytes32(0), "VistaBridgeSender: zero receiver");
        trustedReceivers[dstEid] = receiver;
        emit TrustedReceiverSet(dstEid, receiver);
    }

    function quoteFee(
        uint32 dstEid,
        bytes32 receiver,
        bytes32 claimId,
        address user,
        uint256 amount,
        bytes calldata options
    ) external view returns (ILayerZeroEndpointV2.MessagingFee memory fee) {
        ILayerZeroEndpointV2.MessagingParams memory params = ILayerZeroEndpointV2.MessagingParams({
            dstEid: dstEid,
            receiver: abi.encodePacked(receiver),
            message: abi.encode(claimId, user, amount),
            options: options,
            payInLzToken: false
        });

        fee = endpoint.quote(params, address(this));
    }

    function sendClaim(
        uint32 dstEid,
        bytes32 receiver,
        bytes32 claimId,
        address user,
        uint256 amount,
        bytes calldata options,
        address refundAddress
    ) external payable onlyVault returns (ILayerZeroEndpointV2.MessagingReceipt memory receipt) {
        bytes32 trusted = trustedReceivers[dstEid];
        require(trusted != bytes32(0), "VistaBridgeSender: receiver not set");
        require(trusted == receiver, "VistaBridgeSender: untrusted receiver");

        ILayerZeroEndpointV2.MessagingParams memory params = ILayerZeroEndpointV2.MessagingParams({
            dstEid: dstEid,
            receiver: abi.encodePacked(receiver),
            message: abi.encode(claimId, user, amount),
            options: options,
            payInLzToken: false
        });

        receipt = endpoint.send{ value: msg.value }(params, refundAddress);

        emit ClaimSent(claimId, dstEid, receiver, amount);
    }
}
