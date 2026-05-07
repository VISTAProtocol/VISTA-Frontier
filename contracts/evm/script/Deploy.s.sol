// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {VistaGateway} from "../src/VistaGateway.sol";

/// @notice Deploys VistaGateway to a single chain. Reads addresses from env.
/// Run for each chain:
///   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
///   forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address lzEndpoint = vm.envAddress("LZ_ENDPOINT");
        address tokenMessenger = vm.envAddress("CCTP_TOKEN_MESSENGER");
        address usdc = vm.envAddress("USDC");
        uint32 solanaEid = uint32(vm.envUint("LZ_SOLANA_EID"));

        address deployer = vm.addr(deployerKey);
        console.log("Deploying VistaGateway");
        console.log("  chain id        :", block.chainid);
        console.log("  deployer        :", deployer);
        console.log("  lz endpoint     :", lzEndpoint);
        console.log("  cctp messenger  :", tokenMessenger);
        console.log("  usdc            :", usdc);
        console.log("  solana eid      :", solanaEid);

        vm.startBroadcast(deployerKey);
        VistaGateway gateway = new VistaGateway(
            lzEndpoint,
            deployer,
            tokenMessenger,
            usdc,
            solanaEid
        );
        vm.stopBroadcast();

        console.log("VistaGateway deployed at:", address(gateway));
    }
}
