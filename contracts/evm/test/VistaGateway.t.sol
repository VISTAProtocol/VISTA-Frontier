// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {VistaGateway} from "../src/VistaGateway.sol";
import {ITokenMessenger} from "../src/interfaces/ITokenMessenger.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTokenMessenger is ITokenMessenger {
    uint256 public lastAmount;
    uint32 public lastDomain;
    bytes32 public lastRecipient;
    address public lastBurnToken;
    uint64 public nextNonce = 42;

    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64) {
        IERC20(burnToken).transferFrom(msg.sender, address(this), amount);
        lastAmount = amount;
        lastDomain = destinationDomain;
        lastRecipient = mintRecipient;
        lastBurnToken = burnToken;
        return nextNonce++;
    }
}

contract MockUSDC is IERC20 {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract VistaGatewayTest is Test {
    VistaGateway gateway;
    MockTokenMessenger messenger;
    MockUSDC usdc;

    address owner = address(this);
    address advertiser = address(0xAD0001);
    bytes32 campaignId = keccak256("test-campaign-1");
    bytes32 solanaVault = keccak256("solana-pda-bytes32");

    function setUp() public {
        messenger = new MockTokenMessenger();
        usdc = new MockUSDC();
        gateway = new VistaGateway(owner, address(messenger), address(usdc));
        usdc.mint(advertiser, 1_000_000_000);
    }

    function test_DepositCampaign_BurnsCctp() public {
        uint256 budget = 5_000_000;
        vm.startPrank(advertiser);
        usdc.approve(address(gateway), budget);
        gateway.depositCampaign(campaignId, budget, 72, 300, solanaVault);
        vm.stopPrank();

        assertEq(messenger.lastAmount(), budget);
        assertEq(messenger.lastDomain(), uint32(5));
        assertEq(messenger.lastRecipient(), solanaVault);
        assertEq(messenger.lastBurnToken(), address(usdc));
    }

    function test_RejectZeroBudget() public {
        vm.prank(advertiser);
        vm.expectRevert(VistaGateway.ZeroAmount.selector);
        gateway.depositCampaign(campaignId, 0, 72, 300, solanaVault);
    }

    function test_RejectZeroRate() public {
        vm.prank(advertiser);
        vm.expectRevert(VistaGateway.ZeroRate.selector);
        gateway.depositCampaign(campaignId, 5_000_000, 0, 300, solanaVault);
    }

    function test_RejectDuplicateCampaign() public {
        uint256 budget = 5_000_000;
        vm.startPrank(advertiser);
        usdc.approve(address(gateway), budget * 2);
        gateway.depositCampaign(campaignId, budget, 72, 300, solanaVault);
        vm.expectRevert(VistaGateway.CampaignAlreadyExists.selector);
        gateway.depositCampaign(campaignId, budget, 72, 300, solanaVault);
        vm.stopPrank();
    }
}
