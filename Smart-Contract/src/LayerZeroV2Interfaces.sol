// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILayerZeroEndpointV2 {
    struct MessagingParams {
        uint32 dstEid;
        bytes receiver;
        bytes message;
        bytes options;
        bool payInLzToken;
    }

    struct MessagingFee {
        uint256 nativeFee;
        uint256 lzTokenFee;
    }

    struct MessagingReceipt {
        bytes32 guid;
        uint64 nonce;
        MessagingFee fee;
    }

    function quote(
        MessagingParams calldata params,
        address sender
    ) external view returns (MessagingFee memory fee);

    function send(
        MessagingParams calldata params,
        address refundAddress
    ) external payable returns (MessagingReceipt memory receipt);
}

interface ILayerZeroReceiverV2 {
    struct Origin {
        uint32 srcEid;
        bytes32 sender;
        uint64 nonce;
    }

    function lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) external payable;
}
