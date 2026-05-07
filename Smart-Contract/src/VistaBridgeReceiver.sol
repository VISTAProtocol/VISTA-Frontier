// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LayerZeroV2Interfaces.sol";
import "./VistaToken.sol";

/// @title VistaBridgeReceiver
/// @notice Receives LayerZero V2 messages and mints VistaToken on destination chains
contract VistaBridgeReceiver is Ownable, ILayerZeroReceiverV2 {
    ILayerZeroEndpointV2 public immutable endpoint;
    VistaToken public immutable vistaToken;

    mapping(uint32 => bytes32) public trustedSenders;
    mapping(bytes32 => bool) public claimed;

    event TrustedSenderSet(uint32 indexed srcEid, bytes32 sender);
    event ClaimReceived(bytes32 indexed claimId, address indexed user, uint256 amount);

    constructor(address _endpoint, address _vistaToken) Ownable(msg.sender) {
        require(_endpoint != address(0), "VistaBridgeReceiver: zero endpoint");
        require(_vistaToken != address(0), "VistaBridgeReceiver: zero token");
        endpoint = ILayerZeroEndpointV2(_endpoint);
        vistaToken = VistaToken(_vistaToken);
    }

    function setTrustedSender(uint32 srcEid, bytes32 sender) external onlyOwner {
        require(sender != bytes32(0), "VistaBridgeReceiver: zero sender");
        trustedSenders[srcEid] = sender;
        emit TrustedSenderSet(srcEid, sender);
    }

    function lzReceive(
        Origin calldata origin,
        bytes32,
        bytes calldata message,
        address,
        bytes calldata
    ) external payable override {
        require(msg.sender == address(endpoint), "VistaBridgeReceiver: invalid endpoint");
        bytes32 trusted = trustedSenders[origin.srcEid];
        require(trusted != bytes32(0), "VistaBridgeReceiver: sender not set");
        require(trusted == origin.sender, "VistaBridgeReceiver: untrusted sender");

        (bytes32 claimId, address user, uint256 amount) = abi.decode(
            message,
            (bytes32, address, uint256)
        );
        require(!claimed[claimId], "VistaBridgeReceiver: already claimed");
        claimed[claimId] = true;

        vistaToken.mint(user, amount);

        emit ClaimReceived(claimId, user, amount);
    }
}
