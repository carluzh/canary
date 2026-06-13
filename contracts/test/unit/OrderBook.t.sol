// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";

contract OrderBookTest is BaseTest {
    // ------------------------------------------------------------ placeOrder

    function test_placeBuy_escrowsRoundedUpCollateral() public {
        // 33 tokens at 0.333333: ceil(33e6 * 333333 / 1e6) = 10_999_989 + 1
        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, 333_333, 33e6);

        (address maker, bool isYes, bool isBuy, uint64 price, uint128 remaining, uint128 escrow) = market.orders(id);
        assertEq(maker, alice);
        assertTrue(isYes);
        assertTrue(isBuy);
        assertEq(price, 333_333);
        assertEq(remaining, 33e6);
        uint256 expectedEscrow = (uint256(33e6) * 333_333 + 1e6 - 1) / 1e6;
        assertEq(escrow, expectedEscrow);
        assertEq(market.totalBuyEscrow(), expectedEscrow);
        assertEq(usdc.balanceOf(address(market)), expectedEscrow);
    }

    function test_placeSell_escrowsOutcomeTokens() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 60e6);

        assertEq(market.yesBalance(bob), 40e6); // 60 locked in the order
        assertEq(market.noBalance(bob), 100e6);
        (,,,, uint128 remaining, uint128 escrow) = market.orders(id);
        assertEq(remaining, 60e6);
        assertEq(escrow, 0);
    }

    function test_placeSellNo_escrowsNoTokens() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        market.placeOrder(false, false, 0.90e6, 50e6);
        assertEq(market.noBalance(bob), 50e6);
        assertEq(market.yesBalance(bob), 100e6);
    }

    function test_placeOrder_revert_priceBounds() public {
        vm.startPrank(alice);
        vm.expectRevert(CanaryMarket.InvalidPrice.selector);
        market.placeOrder(true, true, 0, 1e6);
        vm.expectRevert(CanaryMarket.InvalidPrice.selector);
        market.placeOrder(true, true, 1e6, 1e6); // price must be < 1.0
        vm.stopPrank();
    }

    function test_placeOrder_revert_zeroAmount() public {
        vm.expectRevert(CanaryMarket.ZeroAmount.selector);
        vm.prank(alice);
        market.placeOrder(true, true, 0.05e6, 0);
    }

    function test_placeSell_revert_insufficientTokens() public {
        vm.expectRevert(CanaryMarket.InsufficientBalance.selector);
        vm.prank(alice);
        market.placeOrder(true, false, 0.05e6, 1e6);
    }

    function test_placeOrder_revert_afterExpiry() public {
        vm.warp(expiry);
        vm.expectRevert(CanaryMarket.TradingClosed.selector);
        vm.prank(alice);
        market.placeOrder(true, true, 0.05e6, 1e6);
    }

    // ----------------------------------------------------------- cancelOrder

    function test_cancelBuy_refundsEscrow() public {
        vm.startPrank(alice);
        uint256 id = market.placeOrder(true, true, 0.05e6, 100e6);
        market.cancelOrder(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS);
        assertEq(market.totalBuyEscrow(), 0);
        (,,,, uint128 remaining,) = market.orders(id);
        assertEq(remaining, 0);
    }

    function test_cancelSell_returnsTokens() public {
        _mintSets(bob, 100e6);
        vm.startPrank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);
        market.cancelOrder(id);
        vm.stopPrank();
        assertEq(market.yesBalance(bob), 100e6);
    }

    function test_cancel_revert_notMaker() public {
        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, 0.05e6, 100e6);
        vm.expectRevert(CanaryMarket.NotMaker.selector);
        vm.prank(bob);
        market.cancelOrder(id);
    }

    function test_cancel_revert_alreadyCancelled() public {
        vm.startPrank(alice);
        uint256 id = market.placeOrder(true, true, 0.05e6, 100e6);
        market.cancelOrder(id);
        vm.expectRevert(CanaryMarket.OrderInactive.selector);
        market.cancelOrder(id);
        vm.stopPrank();
    }

    function test_cancel_worksAfterResolution_recoversEscrow() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 sellId = market.placeOrder(true, false, 0.05e6, 100e6);
        vm.prank(alice);
        uint256 buyId = market.placeOrder(false, true, 0.80e6, 10e6);

        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();

        vm.prank(bob);
        market.cancelOrder(sellId);
        assertEq(market.yesBalance(bob), 100e6);
        vm.prank(alice);
        market.cancelOrder(buyId);
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS);

        // bob's recovered NO is redeemable
        vm.prank(bob);
        assertEq(market.redeem(), 100e6);
    }

    // ------------------------------------------------------------- fillOrder

    function test_fillSell_transfersTokensAndPremium() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);

        vm.prank(alice);
        market.fillOrder(id, 100e6);

        assertEq(market.yesBalance(alice), 100e6);
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS - 5e6);
        // premium goes straight to the maker
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS - 100e6 + 5e6);
        (,,,, uint128 remaining,) = market.orders(id);
        assertEq(remaining, 0);
    }

    function test_fillSell_partialThenRest() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);

        vm.prank(alice);
        market.fillOrder(id, 30e6);
        assertEq(market.yesBalance(alice), 30e6);
        (,,,, uint128 remaining,) = market.orders(id);
        assertEq(remaining, 70e6);

        vm.prank(carol);
        market.fillOrder(id, 70e6);
        assertEq(market.yesBalance(carol), 70e6);
    }

    function test_fillBuy_paysFromEscrow() public {
        // alice bids 0.05 for 100 YES; bob mints sets and hits the bid
        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, 0.05e6, 100e6);
        _mintSets(bob, 100e6);

        vm.prank(bob);
        market.fillOrder(id, 100e6);

        assertEq(market.yesBalance(alice), 100e6);
        assertEq(market.yesBalance(bob), 0);
        assertEq(market.noBalance(bob), 100e6);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS - 100e6 + 5e6);
        assertEq(market.totalBuyEscrow(), 0);
    }

    function test_fillBuy_partialFloorsFinalSweeps() public {
        // Awkward price so partial fills round down and the final fill sweeps dust.
        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, 333_333, 100e6);
        uint256 escrow = market.totalBuyEscrow();

        _mintSets(bob, 100e6);
        vm.startPrank(bob);
        market.fillOrder(id, 1);
        uint256 firstPay = (uint256(1) * 333_333) / 1e6; // floor -> 0
        assertEq(firstPay, 0);
        market.fillOrder(id, 100e6 - 1); // final fill sweeps everything left
        vm.stopPrank();

        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS - 100e6 + escrow);
        assertEq(market.totalBuyEscrow(), 0);
        (,,,, uint128 remaining, uint128 escrowLeft) = market.orders(id);
        assertEq(remaining, 0);
        assertEq(escrowLeft, 0);
    }

    function test_fillSell_minimumPaysOne() public {
        // Taker can never receive tokens for zero collateral: cost rounds up.
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 1, 100e6); // price 0.000001
        vm.prank(alice);
        market.fillOrder(id, 1);
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS - 1);
    }

    function test_fillBuy_revert_takerLacksTokens() public {
        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, 0.05e6, 100e6);
        vm.expectRevert(CanaryMarket.InsufficientBalance.selector);
        vm.prank(bob);
        market.fillOrder(id, 1e6);
    }

    function test_fill_revert_tooLarge() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);
        vm.expectRevert(CanaryMarket.FillTooLarge.selector);
        vm.prank(alice);
        market.fillOrder(id, 100e6 + 1);
    }

    function test_fill_revert_zeroAmount() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);
        vm.expectRevert(CanaryMarket.ZeroAmount.selector);
        vm.prank(alice);
        market.fillOrder(id, 0);
    }

    function test_fill_revert_inactiveOrder() public {
        vm.expectRevert(CanaryMarket.OrderInactive.selector);
        vm.prank(alice);
        market.fillOrder(999, 1);
    }

    function test_fill_revert_afterExpiry() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);
        vm.warp(expiry);
        vm.expectRevert(CanaryMarket.TradingClosed.selector);
        vm.prank(alice);
        market.fillOrder(id, 1e6);
    }

    function test_fill_revert_afterResolution() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        uint256 id = market.placeOrder(true, false, 0.05e6, 100e6);
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);
        market.settleDepeg(firstRound);
        vm.expectRevert(CanaryMarket.MarketNotOpen.selector);
        vm.prank(alice);
        market.fillOrder(id, 1e6);
    }

    // ----------------------------------------------------------------- views

    function test_openOrders_listsOnlyActive() public {
        _mintSets(bob, 100e6);
        vm.startPrank(bob);
        uint256 a = market.placeOrder(true, false, 0.05e6, 50e6);
        uint256 b = market.placeOrder(true, false, 0.07e6, 50e6);
        market.cancelOrder(a);
        vm.stopPrank();
        vm.prank(alice);
        uint256 c = market.placeOrder(false, true, 0.80e6, 10e6);

        (uint256[] memory ids, CanaryMarket.Order[] memory list) = market.openOrders();
        assertEq(ids.length, 2);
        assertEq(ids[0], b);
        assertEq(ids[1], c);
        assertEq(list[0].maker, bob);
        assertEq(list[1].maker, alice);
    }
}
