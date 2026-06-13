// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../../src/mocks/MockV3Aggregator.sol";

/// @notice Invariant-fuzzing handler. Every action is guarded by the exact
/// preconditions of the market, so the suite runs with fail-on-revert: any
/// revert is a bug in either the contract or our understanding of it.
contract MarketHandler is Test {
    CanaryMarket public market;
    MockUSDC public usdc;
    MockV3Aggregator public feed;

    address[] public actors;
    int256 internal immutable threshold;
    uint64 internal immutable window;
    uint64 internal immutable expiry;
    uint64 internal immutable grace;

    /// First round of the in-progress below-threshold streak (0 = no streak).
    uint80 public currentBreachFirstRound;

    uint256 internal constant MAX_AMOUNT = 1_000_000e6;
    uint256 internal constant PRICE_SCALE = 1e6;

    constructor(CanaryMarket market_, MockUSDC usdc_, MockV3Aggregator feed_) {
        market = market_;
        usdc = usdc_;
        feed = feed_;
        threshold = market_.depegThreshold();
        window = market_.breachWindow();
        expiry = market_.expiry();
        grace = market_.settlementGrace();

        for (uint256 i = 0; i < 4; i++) {
            address actor = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(actor);
            vm.prank(actor);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    // ------------------------------------------------------------- actions

    function mintSets(uint256 actorSeed, uint256 amount) external {
        if (!_tradingOpen()) return;
        address actor = _actor(actorSeed);
        amount = bound(amount, 1, MAX_AMOUNT);
        usdc.mint(actor, amount);
        vm.prank(actor);
        market.mintSets(amount);
    }

    function burnSets(uint256 actorSeed, uint256 amount) external {
        if (market.state() != CanaryMarket.State.Open) return;
        address actor = _actor(actorSeed);
        uint256 cap = _min(market.yesBalance(actor), market.noBalance(actor));
        if (cap == 0) return;
        amount = bound(amount, 1, cap);
        vm.prank(actor);
        market.burnSets(amount);
    }

    function placeBuy(uint256 actorSeed, bool isYes, uint256 price, uint256 amount) external {
        if (!_tradingOpen()) return;
        address actor = _actor(actorSeed);
        price = bound(price, 1, PRICE_SCALE - 1);
        amount = bound(amount, 1, MAX_AMOUNT);
        uint256 escrow = (amount * price + PRICE_SCALE - 1) / PRICE_SCALE;
        usdc.mint(actor, escrow);
        vm.prank(actor);
        market.placeOrder(isYes, true, uint64(price), uint128(amount));
    }

    function placeSell(uint256 actorSeed, bool isYes, uint256 price, uint256 amount) external {
        if (!_tradingOpen()) return;
        address actor = _actor(actorSeed);
        uint256 cap = isYes ? market.yesBalance(actor) : market.noBalance(actor);
        if (cap == 0) return;
        price = bound(price, 1, PRICE_SCALE - 1);
        amount = bound(amount, 1, cap);
        vm.prank(actor);
        market.placeOrder(isYes, false, uint64(price), uint128(amount));
    }

    function cancelOrder(uint256 actorSeed, uint256 orderSeed) external {
        address actor = _actor(actorSeed);
        uint256 total = market.nextOrderId();
        if (total == 0) return;
        uint256 start = orderSeed % total;
        for (uint256 i = 0; i < total; i++) {
            uint256 id = (start + i) % total;
            (address maker,,,, uint128 remaining,) = market.orders(id);
            if (maker == actor && remaining > 0) {
                vm.prank(actor);
                market.cancelOrder(id);
                return;
            }
        }
    }

    function fillOrder(uint256 actorSeed, uint256 orderSeed, uint256 amount) external {
        if (!_tradingOpen()) return;
        address actor = _actor(actorSeed);
        uint256 total = market.nextOrderId();
        if (total == 0) return;
        uint256 start = orderSeed % total;
        for (uint256 i = 0; i < total; i++) {
            uint256 id = (start + i) % total;
            (, bool isYes, bool isBuy, uint64 price, uint128 remaining,) = market.orders(id);
            if (remaining == 0) continue;

            uint128 fill = uint128(bound(amount, 1, remaining));
            if (isBuy) {
                // taker delivers outcome tokens: mint complete sets to cover
                uint256 have = isYes ? market.yesBalance(actor) : market.noBalance(actor);
                if (have < fill) {
                    usdc.mint(actor, fill - have);
                    vm.prank(actor);
                    market.mintSets(fill - have);
                }
            } else {
                // taker pays collateral straight to the maker
                uint256 cost = (uint256(fill) * price + PRICE_SCALE - 1) / PRICE_SCALE;
                usdc.mint(actor, cost);
            }
            vm.prank(actor);
            market.fillOrder(id, fill);
            return;
        }
    }

    function warp(uint256 delta) external {
        delta = bound(delta, 1, 2 days);
        vm.warp(block.timestamp + delta);
    }

    function pushPrice(uint256 seed) external {
        bool below = seed % 2 == 0;
        int256 answer = below
            ? int256(bound(seed, 1, uint256(threshold) - 1))
            : int256(bound(seed, uint256(threshold), uint256(threshold) * 2));
        feed.updateAnswer(answer);
        if (below) {
            if (currentBreachFirstRound == 0) currentBreachFirstRound = feed.latestRound();
        } else {
            currentBreachFirstRound = 0;
        }
    }

    function settleDepeg() external {
        if (market.state() != CanaryMarket.State.Open) return;
        uint80 first = currentBreachFirstRound;
        if (first == 0) return;
        uint256 t0 = feed.timestamps(first);
        if (t0 + window > expiry) return; // could never complete before expiry
        if (block.timestamp < t0 + window) return; // window not elapsed yet
        market.settleDepeg(first);
    }

    function settleExpiry() external {
        if (market.state() != CanaryMarket.State.Open) return;
        if (block.timestamp <= uint256(expiry) + grace) return;
        market.settleExpiry();
    }

    function redeem(uint256 actorSeed) external {
        CanaryMarket.State s = market.state();
        if (s == CanaryMarket.State.Open) return;
        address actor = _actor(actorSeed);
        uint256 payout =
            s == CanaryMarket.State.TriggeredYes ? market.yesBalance(actor) : market.noBalance(actor);
        if (payout == 0) return;
        vm.prank(actor);
        market.redeem();
    }

    // ------------------------------------------------------------- helpers

    function _tradingOpen() internal view returns (bool) {
        return market.state() == CanaryMarket.State.Open && block.timestamp < market.expiry();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
