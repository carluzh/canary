// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";

contract SettlementTest is BaseTest {
    // ------------------------------------------------------------ settleDepeg

    function test_settleDepeg_continuousBreach() public {
        vm.warp(block.timestamp + 1 days);
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);

        vm.expectEmit(true, true, true, true);
        emit CanaryMarket.MarketTriggered(firstRound, block.timestamp - WINDOW);
        market.settleDepeg(firstRound);

        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
        assertEq(market.breachStart(), block.timestamp - WINDOW);
    }

    function test_settleDepeg_feedSilentAfterBreach() public {
        // One breached round, then the feed goes quiet (heartbeat lapse). The
        // price "is" the last answer, so once the window elapses in wall-clock
        // time the breach is proven.
        feed.updateAnswer(0.90e8);
        uint80 round = feed.latestRound();

        vm.warp(block.timestamp + WINDOW - 1);
        vm.expectRevert(CanaryMarket.BreachWindowNotElapsed.selector);
        market.settleDepeg(round);

        vm.warp(block.timestamp + 1);
        market.settleDepeg(round);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }

    function test_settleDepeg_recoveryRoundAfterWindowEndIsFine() public {
        // Breach holds the whole window; price recovers only afterwards.
        uint80 firstRound = _breachFor(WINDOW / 2, 10 minutes);
        vm.warp(block.timestamp + WINDOW); // silent feed past window end
        feed.updateAnswer(PEG); // recovery, but after the window completed
        market.settleDepeg(firstRound);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }

    function test_settleDepeg_revert_breachInterrupted() public {
        feed.updateAnswer(0.90e8);
        uint80 firstRound = feed.latestRound();
        vm.warp(block.timestamp + 30 minutes);
        feed.updateAnswer(0.97e8); // recovers inside the window
        uint80 recoveryRound = feed.latestRound();
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(abi.encodeWithSelector(CanaryMarket.BreachInterrupted.selector, recoveryRound));
        market.settleDepeg(firstRound);
    }

    function test_settleDepeg_succeedsFromSecondDip() public {
        // Dip, recovery, then a real sustained breach: settle from the second dip.
        feed.updateAnswer(0.90e8);
        vm.warp(block.timestamp + 30 minutes);
        feed.updateAnswer(0.97e8);
        vm.warp(block.timestamp + 30 minutes);
        uint80 secondDip = _breachFor(WINDOW, 5 minutes);
        market.settleDepeg(secondDip);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }

    function test_settleDepeg_revert_priceNotBelowThreshold() public {
        feed.updateAnswer(0.96e8); // close, but at/above threshold
        uint80 round = feed.latestRound();
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(CanaryMarket.PriceNotBelowThreshold.selector);
        market.settleDepeg(round);
    }

    function test_settleDepeg_thresholdIsExclusive() public {
        feed.updateAnswer(THRESHOLD); // exactly $0.95 is NOT a breach
        uint80 round = feed.latestRound();
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(CanaryMarket.PriceNotBelowThreshold.selector);
        market.settleDepeg(round);
    }

    function test_settleDepeg_revert_unknownRound() public {
        vm.expectRevert(CanaryMarket.InvalidRound.selector);
        market.settleDepeg(999);
    }

    function test_settleDepeg_revert_roundBeforeCreation() public {
        // A breach that predates the market cannot trigger it.
        feed.updateAnswerAt(0.90e8, START_TIME - 1);
        uint80 oldRound = feed.latestRound();
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(CanaryMarket.RoundBeforeCreation.selector);
        market.settleDepeg(oldRound);
    }

    function test_settleDepeg_revert_windowWouldEndAfterExpiry() public {
        vm.warp(uint256(expiry) - 30 minutes); // window can no longer complete
        feed.updateAnswer(0.90e8);
        uint80 round = feed.latestRound();
        vm.warp(uint256(expiry) + GRACE);
        vm.expectRevert(CanaryMarket.BreachWindowExceedsExpiry.selector);
        market.settleDepeg(round);
    }

    function test_settleDepeg_revert_alreadySettled() public {
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);
        market.settleDepeg(firstRound);
        vm.expectRevert(CanaryMarket.MarketNotOpen.selector);
        market.settleDepeg(firstRound);
    }

    // ----------------------------------------------------------- settleExpiry

    function test_settleExpiry_afterGrace() public {
        vm.warp(uint256(expiry) + GRACE + 1);
        vm.expectEmit(true, true, true, true);
        emit CanaryMarket.MarketExpired();
        market.settleExpiry();
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.ExpiredNo));
    }

    function test_settleExpiry_revert_beforeExpiry() public {
        vm.expectRevert(CanaryMarket.NotYetExpired.selector);
        market.settleExpiry();
    }

    function test_settleExpiry_revert_duringGrace() public {
        vm.warp(uint256(expiry) + GRACE); // boundary: still inside grace
        vm.expectRevert(CanaryMarket.NotYetExpired.selector);
        market.settleExpiry();
    }

    function test_settleExpiry_revert_alreadyTriggered() public {
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);
        market.settleDepeg(firstRound);
        vm.warp(uint256(expiry) + GRACE + 1);
        vm.expectRevert(CanaryMarket.MarketNotOpen.selector);
        market.settleExpiry();
    }

    /// The reason the grace period exists: a breach completes just before
    /// expiry, nobody settles in time, expiry passes — YES holders can still
    /// prove the depeg during grace before NO can lock the market.
    function test_graceWindow_lateDepegProofBeatsExpiry() public {
        vm.warp(uint256(expiry) - WINDOW - 10 minutes);
        uint80 firstRound = _breachFor(WINDOW, 5 minutes);

        vm.warp(uint256(expiry) + GRACE); // past expiry, inside grace
        vm.expectRevert(CanaryMarket.NotYetExpired.selector);
        market.settleExpiry(); // NO cannot lock it in yet...

        market.settleDepeg(firstRound); // ...but the breach proof still lands
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }
}
