// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";

contract OrderBookFuzzTest is BaseTest {
    uint256 internal constant MAX_AMOUNT = 500_000e6;
    uint256 internal constant PRICE_SCALE = 1e6;

    function testFuzz_mintBurnRoundtrip(uint256 mintAmount, uint256 burnAmount) public {
        mintAmount = bound(mintAmount, 1, ACTOR_FUNDS);
        burnAmount = bound(burnAmount, 1, mintAmount);

        _mintSets(bob, mintAmount);
        vm.prank(bob);
        market.burnSets(burnAmount);

        assertEq(market.yesBalance(bob), mintAmount - burnAmount);
        assertEq(market.noBalance(bob), mintAmount - burnAmount);
        assertEq(market.yesSupply(), market.noSupply());
        assertEq(usdc.balanceOf(address(market)), mintAmount - burnAmount);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS - mintAmount + burnAmount);
    }

    /// A buy order's escrow always covers what remains and pays out in full —
    /// no dust is ever stranded, regardless of how fills are chunked.
    function testFuzz_buyOrder_escrowConservation(uint64 price, uint128 amount, uint256 seed) public {
        price = uint64(bound(price, 1, PRICE_SCALE - 1));
        amount = uint128(bound(amount, 1, MAX_AMOUNT));

        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, price, amount);
        uint256 escrow0 = market.totalBuyEscrow();
        assertEq(escrow0, (uint256(amount) * price + PRICE_SCALE - 1) / PRICE_SCALE);

        _mintSets(bob, amount);
        uint256 bobUsdcAfterMint = usdc.balanceOf(bob);

        uint128 left = amount;
        uint256 iterations;
        while (left > 0) {
            seed = uint256(keccak256(abi.encode(seed)));
            // cap the number of chunks so the test cannot run unbounded
            uint128 chunk = (++iterations >= 30) ? left : uint128(bound(seed, 1, left));
            vm.prank(bob);
            market.fillOrder(id, chunk);
            left -= chunk;

            // mid-flight safety: escrow always covers the remaining size
            (,,,, uint128 remaining, uint128 escrowLeft) = market.orders(id);
            assertEq(remaining, left);
            assertGe(escrowLeft, (uint256(remaining) * price + PRICE_SCALE - 1) / PRICE_SCALE);
        }

        // taker received exactly the original escrow across all fills
        assertEq(usdc.balanceOf(bob) - bobUsdcAfterMint, escrow0);
        assertEq(market.totalBuyEscrow(), 0);
        assertEq(market.yesBalance(alice), amount);
        assertEq(market.yesBalance(bob), 0);
    }

    /// Filling a sell order always costs ceil(amount * price): never free, and
    /// the premium lands with the maker exactly.
    function testFuzz_sellOrder_costRoundsUp(uint64 price, uint128 amount, uint128 fill, bool isYes) public {
        price = uint64(bound(price, 1, PRICE_SCALE - 1));
        amount = uint128(bound(amount, 1, MAX_AMOUNT));
        fill = uint128(bound(fill, 1, amount));

        _mintSets(bob, amount);
        vm.prank(bob);
        uint256 id = market.placeOrder(isYes, false, price, amount);
        uint256 bobUsdcAfterMint = usdc.balanceOf(bob);

        vm.prank(alice);
        market.fillOrder(id, fill);

        uint256 cost = (uint256(fill) * price + PRICE_SCALE - 1) / PRICE_SCALE;
        assertGt(cost, 0);
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS - cost);
        assertEq(usdc.balanceOf(bob), bobUsdcAfterMint + cost);
        if (isYes) assertEq(market.yesBalance(alice), fill);
        else assertEq(market.noBalance(alice), fill);
    }

    /// Cancelling after any partial fill refunds exactly the unspent escrow.
    function testFuzz_buyOrder_cancelRefundsRemainder(uint64 price, uint128 amount, uint128 fill) public {
        price = uint64(bound(price, 1, PRICE_SCALE - 1));
        amount = uint128(bound(amount, 2, MAX_AMOUNT));
        fill = uint128(bound(fill, 1, amount - 1));

        vm.prank(alice);
        uint256 id = market.placeOrder(true, true, price, amount);

        _mintSets(bob, fill);
        vm.prank(bob);
        market.fillOrder(id, fill);

        uint256 paidToBob = (uint256(fill) * price) / PRICE_SCALE;
        vm.prank(alice);
        market.cancelOrder(id);

        uint256 escrow0 = (uint256(amount) * price + PRICE_SCALE - 1) / PRICE_SCALE;
        // alice spent escrow0, got back escrow0 - paidToBob
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS - paidToBob);
        assertEq(market.totalBuyEscrow(), 0);
        // the only USDC left in the market backs bob's outstanding sets
        assertEq(usdc.balanceOf(address(market)), market.yesSupply());
    }

    /// Full lifecycle conservation: whatever happens, redemptions after
    /// resolution pay out exactly the set collateral, leaving the market empty.
    function testFuzz_redeemDrainsMarketExactly(uint256 mintA, uint256 mintB, bool depeg) public {
        mintA = bound(mintA, 1, ACTOR_FUNDS);
        mintB = bound(mintB, 1, ACTOR_FUNDS);
        _mintSets(alice, mintA);
        _mintSets(bob, mintB);

        if (depeg) {
            uint80 firstRound = _breachFor(WINDOW, 10 minutes);
            market.settleDepeg(firstRound);
        } else {
            vm.warp(uint256(expiry) + GRACE + 1);
            market.settleExpiry();
        }

        vm.prank(alice);
        assertEq(market.redeem(), mintA);
        vm.prank(bob);
        assertEq(market.redeem(), mintB);

        assertEq(usdc.balanceOf(address(market)), 0);
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS);
    }
}
