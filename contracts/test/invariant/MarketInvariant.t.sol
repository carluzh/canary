// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../../src/CanaryMarketFactory.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../../src/mocks/MockV3Aggregator.sol";
import {MarketHandler} from "./MarketHandler.sol";

/// Handler actions are precondition-guarded, so any revert is a real finding.
/// forge-config: default.invariant.fail-on-revert = true
/// forge-config: ci.invariant.fail-on-revert = true
contract MarketInvariantTest is Test {
    CanaryMarket internal market;
    MockUSDC internal usdc;
    MockV3Aggregator internal feed;
    MarketHandler internal handler;

    function setUp() public {
        vm.warp(1_750_000_000);
        usdc = new MockUSDC();
        feed = new MockV3Aggregator(8, 1e8);
        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(address(usdc)));
        market = CanaryMarket(
            factory.createMarket(
                AggregatorV3Interface(address(feed)),
                0.95e8,
                1 hours,
                uint64(block.timestamp + 30 days),
                1 hours,
                "USDe < $0.95 for 1h"
            )
        );
        handler = new MarketHandler(market, usdc, feed);
        targetContract(address(handler));
    }

    /// Complete sets are the only mint path: YES and NO supply move in lockstep
    /// until resolution lets the winning side burn via redemption.
    function invariant_suppliesMatchWhileOpen() public view {
        if (market.state() == CanaryMarket.State.Open) {
            assertEq(market.yesSupply(), market.noSupply(), "yes/no supply diverged while open");
        }
    }

    /// Exact solvency: the market holds precisely one collateral unit per
    /// outstanding (potentially) winning token, plus all open buy escrows.
    /// Equality (not >=) — every wei is accounted for.
    function invariant_exactSolvency() public view {
        CanaryMarket.State s = market.state();
        uint256 backing = s == CanaryMarket.State.ExpiredNo ? market.noSupply() : market.yesSupply();
        assertEq(
            usdc.balanceOf(address(market)),
            backing + market.totalBuyEscrow(),
            "market balance != backing + buy escrow"
        );
    }

    /// Every outcome token is either in a user balance or escrowed in an open
    /// sell order — none created or destroyed anywhere else.
    function invariant_tokenConservation() public view {
        uint256 yesHeld;
        uint256 noHeld;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address actor = handler.actors(i);
            yesHeld += market.yesBalance(actor);
            noHeld += market.noBalance(actor);
        }
        uint256 total = market.nextOrderId();
        for (uint256 id = 0; id < total; id++) {
            (, bool isYes, bool isBuy,, uint128 remaining,) = market.orders(id);
            if (!isBuy && remaining > 0) {
                if (isYes) yesHeld += remaining;
                else noHeld += remaining;
            }
        }
        assertEq(yesHeld, market.yesSupply(), "YES tokens leaked");
        assertEq(noHeld, market.noSupply(), "NO tokens leaked");
    }

    /// The aggregate buy-escrow counter always equals the per-order sum.
    function invariant_buyEscrowAccounting() public view {
        uint256 sum;
        uint256 total = market.nextOrderId();
        for (uint256 id = 0; id < total; id++) {
            (,,,,, uint128 escrow) = market.orders(id);
            sum += escrow;
        }
        assertEq(sum, market.totalBuyEscrow(), "buy escrow counter drifted");
    }

    /// Resolution is terminal and consistent with the trigger semantics.
    function invariant_stateMachineSane() public view {
        CanaryMarket.State s = market.state();
        if (s == CanaryMarket.State.TriggeredYes) {
            // a proven breach started while the market was live and completed pre-expiry
            uint256 start = market.breachStart();
            assertGe(start, market.createdAt());
            assertLe(start + market.breachWindow(), market.expiry());
        }
        if (s == CanaryMarket.State.ExpiredNo) {
            assertGt(block.timestamp, uint256(market.expiry()) + market.settlementGrace());
        }
    }
}
