// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {VistaEscrow} from "../src/VistaEscrow.sol";
import {VistaVault} from "../src/VistaVault.sol";
import {VistaReceipt} from "../src/VistaReceipt.sol";
import {VistaStream} from "../src/VistaStream.sol";

contract VistaStreamTest is Test {
    MockUSDC usdc;
    VistaEscrow escrow;
    VistaVault vault;
    VistaReceipt receipt;
    VistaStream stream;

    address advertiser;
    address userWallet;
    address publisherWallet;
    address oracle;
    address vistaWallet;

    // 6-decimal amounts: 100 mUSDC/s rate, 100s duration, 10_000 mUSDC total budget
    uint256 constant RATE_PER_SECOND = 100;
    uint256 constant DURATION = 100;
    uint256 constant BUDGET = RATE_PER_SECOND * DURATION; // 10_000

    bytes32 constant CAMPAIGN_ID = keccak256("campaign-1");
    bytes32 constant SESSION_ID = keccak256("session-1");

    function setUp() public {
        advertiser = makeAddr("advertiser");
        userWallet = makeAddr("user");
        publisherWallet = makeAddr("publisher");
        oracle = makeAddr("oracle");
        vistaWallet = makeAddr("vistaWallet");

        usdc = new MockUSDC();
        escrow = new VistaEscrow(address(usdc));
        vault = new VistaVault(address(usdc));
        receipt = new VistaReceipt();
        stream = new VistaStream(
            address(escrow),
            address(vault),
            address(receipt),
            oracle,
            vistaWallet
        );

        escrow.setAuthorizedStream(address(stream));
        vault.setAuthorizedStream(address(stream));
        receipt.setAuthorizedStream(address(stream));

        // Fund advertiser with 10x budget and pre-approve escrow
        usdc.mint(advertiser, BUDGET * 10);
        vm.prank(advertiser);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ─── Test 1: Full happy path ───────────────────────────────────────────────

    function testFullHappyPath() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 10);

        uint256 totalTick = RATE_PER_SECOND * 10; // 1000 mUSDC
        uint256 expectedUser = (totalTick * 50) / 100; // 500
        uint256 expectedPublisher = (totalTick * 40) / 100; // 400
        uint256 expectedVista = totalTick - expectedUser - expectedPublisher; // 100

        assertEq(vault.getBalance(userWallet), expectedUser, "user vault balance");
        assertEq(vault.getBalance(publisherWallet), expectedPublisher, "publisher vault balance");
        assertEq(usdc.balanceOf(vistaWallet), expectedVista, "vista wallet balance");
        assertEq(
            escrow.getCampaign(CAMPAIGN_ID).remainingBudget,
            BUDGET - totalTick,
            "remaining budget"
        );
        assertEq(escrow.getCampaign(CAMPAIGN_ID).active, true, "campaign still active");

        // Verify session state via public mapping
        (
            bytes32 sId,
            bytes32 cId,
            address uWallet,
            address pWallet,
            uint256 secondsVerified,
            uint256 totalPaid,
            bool active,
        ) = stream.sessions(SESSION_ID);

        assertEq(sId, SESSION_ID, "session id");
        assertEq(cId, CAMPAIGN_ID, "campaign id");
        assertEq(uWallet, userWallet, "user wallet in session");
        assertEq(pWallet, publisherWallet, "publisher wallet in session");
        assertEq(secondsVerified, 10, "seconds verified");
        assertEq(totalPaid, totalTick, "total paid");
        assertEq(active, true, "session active");
    }

    // ─── Test 2: Withdraw from vault after tick + endStream ───────────────────

    function testWithdrawFromVault() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 10);

        vm.prank(oracle);
        stream.endStream(SESSION_ID);

        uint256 userVaultBalance = vault.getBalance(userWallet);
        assertGt(userVaultBalance, 0, "user has vault balance");

        uint256 usdcBefore = usdc.balanceOf(userWallet);
        vm.prank(userWallet);
        vault.withdraw();

        assertEq(usdc.balanceOf(userWallet), usdcBefore + userVaultBalance, "usdc transferred to user");
        assertEq(vault.getBalance(userWallet), 0, "vault balance zeroed");

        // Publisher can also withdraw
        uint256 pubVaultBalance = vault.getBalance(publisherWallet);
        assertGt(pubVaultBalance, 0, "publisher has vault balance");
        uint256 pubUsdcBefore = usdc.balanceOf(publisherWallet);
        vm.prank(publisherWallet);
        vault.withdraw();
        assertEq(usdc.balanceOf(publisherWallet), pubUsdcBefore + pubVaultBalance, "usdc transferred to publisher");
        assertEq(vault.getBalance(publisherWallet), 0, "publisher vault balance zeroed");
    }

    // ─── Test 3: Earning records ───────────────────────────────────────────────

    function testEarningRecords() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 10);

        uint256 expectedUserAmount = (RATE_PER_SECOND * 10 * 50) / 100; // 500
        uint256 expectedPubAmount = (RATE_PER_SECOND * 10 * 40) / 100; // 400

        // Check user earning record
        VistaVault.EarningRecord[] memory userRecords = vault.getEarningRecords(userWallet);
        assertEq(userRecords.length, 1, "user has 1 record");
        assertEq(userRecords[0].sessionId, SESSION_ID, "record session id");
        assertEq(userRecords[0].campaignId, CAMPAIGN_ID, "record campaign id");
        assertEq(userRecords[0].publisherWallet, publisherWallet, "record publisher wallet");
        assertEq(userRecords[0].amount, expectedUserAmount, "record user amount");
        assertEq(userRecords[0].role, 0, "record role = user");
        assertGt(userRecords[0].timestamp, 0, "record timestamp set");

        // Check publisher earning record
        VistaVault.EarningRecord[] memory pubRecords = vault.getEarningRecords(publisherWallet);
        assertEq(pubRecords.length, 1, "publisher has 1 record");
        assertEq(pubRecords[0].sessionId, SESSION_ID, "pub record session id");
        assertEq(pubRecords[0].campaignId, CAMPAIGN_ID, "pub record campaign id");
        assertEq(pubRecords[0].publisherWallet, publisherWallet, "pub record publisher wallet");
        assertEq(pubRecords[0].amount, expectedPubAmount, "pub record amount");
        assertEq(pubRecords[0].role, 1, "pub record role = publisher");
    }

    // ─── Test 4: Unauthorized access ──────────────────────────────────────────

    function testUnauthorizedAccess() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        // Non-oracle cannot startStream
        vm.prank(userWallet);
        vm.expectRevert("VistaStream: not oracle");
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        // Set up a valid session for remaining checks
        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        // Non-oracle cannot tickStream
        vm.prank(userWallet);
        vm.expectRevert("VistaStream: not oracle");
        stream.tickStream(SESSION_ID, 10);

        // Non-oracle cannot endStream
        vm.prank(userWallet);
        vm.expectRevert("VistaStream: not oracle");
        stream.endStream(SESSION_ID);

        // Non-stream cannot credit vault directly
        vm.prank(userWallet);
        vm.expectRevert("VistaVault: not authorized stream");
        vault.credit(userWallet, SESSION_ID, CAMPAIGN_ID, publisherWallet, 100, 0);

        // Non-advertiser cannot call refundRemaining
        vm.prank(oracle);
        vm.expectRevert("VistaEscrow: not advertiser");
        escrow.refundRemaining(CAMPAIGN_ID);

        // Non-stream cannot call payout on escrow directly
        vm.prank(userWallet);
        vm.expectRevert("VistaEscrow: not authorized stream");
        escrow.payout(CAMPAIGN_ID, 100, address(vault), 90, vistaWallet, 10);

        // Non-stream cannot mint receipts
        vm.prank(userWallet);
        vm.expectRevert("VistaReceipt: not authorized stream");
        receipt.mint(userWallet, SESSION_ID, CAMPAIGN_ID, advertiser, publisherWallet, 10, 500);
    }

    // ─── Test 5: Budget exhaustion ────────────────────────────────────────────

    function testBudgetExhaustion() public {
        // Budget exactly covers 1 tick of 10 seconds
        uint256 exactBudget = RATE_PER_SECOND * 10; // 1000 mUSDC
        bytes32 exactCampaign = keccak256("exact-campaign");
        bytes32 exactSession = keccak256("exact-session");

        vm.prank(advertiser);
        escrow.deposit(exactCampaign, exactBudget, RATE_PER_SECOND, 10);

        vm.prank(oracle);
        stream.startStream(exactSession, exactCampaign, userWallet, publisherWallet);

        // First tick consumes entire budget
        vm.prank(oracle);
        stream.tickStream(exactSession, 10);

        // Campaign should be deactivated with zero remaining budget
        VistaEscrow.Campaign memory campaign = escrow.getCampaign(exactCampaign);
        assertEq(campaign.active, false, "campaign deactivated after budget exhaustion");
        assertEq(campaign.remainingBudget, 0, "remaining budget is zero");

        // Second tick must revert — campaign is no longer active
        vm.prank(oracle);
        vm.expectRevert("VistaStream: campaign exhausted");
        stream.tickStream(exactSession, 10);
    }

    // ─── Test 6: Advertiser refund ────────────────────────────────────────────

    function testAdvertiserRefund() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        // Tick to partially spend budget
        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);
        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 10);

        uint256 spent = RATE_PER_SECOND * 10;
        uint256 expectedRefund = BUDGET - spent;

        uint256 advertiserBefore = usdc.balanceOf(advertiser);

        vm.prank(advertiser);
        escrow.refundRemaining(CAMPAIGN_ID);

        assertEq(usdc.balanceOf(advertiser), advertiserBefore + expectedRefund, "advertiser received refund");
        assertEq(escrow.getCampaign(CAMPAIGN_ID).active, false, "campaign deactivated after refund");
        assertEq(escrow.getCampaign(CAMPAIGN_ID).remainingBudget, 0, "remaining budget zeroed");
    }

    // ─── Test 7: Receipt minted on endStream ──────────────────────────────────

    function testReceiptMintedOnEndStream() public {
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);

        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);

        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 30);

        vm.prank(oracle);
        stream.endStream(SESSION_ID);

        // User should own tokenId 0
        uint256[] memory tokenIds = receipt.getReceiptsByUser(userWallet);
        assertEq(tokenIds.length, 1, "user has 1 receipt");
        assertEq(tokenIds[0], 0, "token id is 0");

        // Receipt metadata should match session data
        VistaReceipt.Receipt memory r = receipt.getReceipt(0);
        assertEq(r.sessionId, SESSION_ID, "receipt session id");
        assertEq(r.campaignId, CAMPAIGN_ID, "receipt campaign id");
        assertEq(r.userWallet, userWallet, "receipt user wallet");
        assertEq(r.advertiserWallet, advertiser, "receipt advertiser wallet");
        assertEq(r.publisherWallet, publisherWallet, "receipt publisher wallet");
        assertEq(r.secondsVerified, 30, "receipt seconds verified");
        assertEq(r.usdcPaid, RATE_PER_SECOND * 30, "receipt usdc paid");

        // Campaign receipts index
        uint256[] memory campaignTokenIds = receipt.getCampaignReceipts(CAMPAIGN_ID);
        assertEq(campaignTokenIds.length, 1, "campaign has 1 receipt");

        // ERC-1155 balance
        assertEq(receipt.balanceOf(userWallet, 0), 1, "erc1155 balance is 1");
    }

    // ─── Test 8: Soulbound — transfer reverts ─────────────────────────────────

    function testSoulboundTransferReverts() public {
        // Mint a receipt first
        vm.prank(advertiser);
        escrow.deposit(CAMPAIGN_ID, BUDGET, RATE_PER_SECOND, DURATION);
        vm.prank(oracle);
        stream.startStream(SESSION_ID, CAMPAIGN_ID, userWallet, publisherWallet);
        vm.prank(oracle);
        stream.tickStream(SESSION_ID, 10);
        vm.prank(oracle);
        stream.endStream(SESSION_ID);

        // Attempt to transfer — must revert
        vm.prank(userWallet);
        vm.expectRevert("VistaReceipt: soulbound");
        receipt.safeTransferFrom(userWallet, publisherWallet, 0, 1, "");

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 0;
        amounts[0] = 1;
        vm.prank(userWallet);
        vm.expectRevert("VistaReceipt: soulbound");
        receipt.safeBatchTransferFrom(userWallet, publisherWallet, ids, amounts, "");
    }
}
