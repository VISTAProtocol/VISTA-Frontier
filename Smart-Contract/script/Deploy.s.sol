// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {VistaEscrow} from "../src/VistaEscrow.sol";
import {VistaVault} from "../src/VistaVault.sol";
import {VistaReceipt} from "../src/VistaReceipt.sol";
import {VistaStream} from "../src/VistaStream.sol";

contract Deploy is Script {
    address constant VISTA_WALLET = 0x0F028d200a26dA697b6e1FBAD0bC92F917158314;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. MockUSDC — testnet USDC simulation
        MockUSDC usdc = new MockUSDC();

        // 2. VistaEscrow — holds advertiser campaign deposits
        VistaEscrow escrow = new VistaEscrow(address(usdc));

        // 3. VistaVault — holds user and publisher earnings
        VistaVault vault = new VistaVault(address(usdc));

        // 4. VistaReceipt — soulbound session receipt NFTs
        VistaReceipt receipt = new VistaReceipt();

        // 5. VistaStream — core payment engine (oracle = deployer as placeholder)
        VistaStream stream = new VistaStream(
            address(escrow),
            address(vault),
            address(receipt),
            deployer, // oracle placeholder — update via setAuthorizedOracle() after deploy
            VISTA_WALLET
        );

        // 6. Wire VistaStream as the authorized caller for all supporting contracts
        escrow.setAuthorizedStream(address(stream));
        vault.setAuthorizedStream(address(stream));
        receipt.setAuthorizedStream(address(stream));

        vm.stopBroadcast();

        // 7. Write deployments.json (outside broadcast — not a transaction)
        string memory obj = "deployments";
        vm.serializeAddress(obj, "MockUSDC", address(usdc));
        vm.serializeAddress(obj, "VistaEscrow", address(escrow));
        vm.serializeAddress(obj, "VistaVault", address(vault));
        vm.serializeAddress(obj, "VistaReceipt", address(receipt));
        string memory finalJson = vm.serializeAddress(obj, "VistaStream", address(stream));
        vm.writeJson(finalJson, "./deployments.json");
        // Automatically sync deployments.json to Oracle Server
        vm.writeJson(finalJson, "../Oracle-Server-Production/deployments.json");

        console.log("=== VISTA Protocol Deployment ===");
        console.log("MockUSDC:    ", address(usdc));
        console.log("VistaEscrow: ", address(escrow));
        console.log("VistaVault:  ", address(vault));
        console.log("VistaReceipt:", address(receipt));
        console.log("VistaStream: ", address(stream));
        console.log("=================================");
        console.log("Copy deployments.json to your backend and frontend projects");
    }
}
