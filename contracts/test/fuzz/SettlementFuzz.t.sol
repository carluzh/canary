// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";

contract SettlementFuzzTest is BaseTest {
    /// Any continuous run of below-threshold rounds (irregular gaps, varying
    /// answers) spanning the window triggers the market.
    function testFuzz_continuousBreachAlwaysTriggers(uint256 seed, uint8 stepCount) public {
        uint256 steps = bound(stepCount, 0, 20);
        uint256 t0 = block.timestamp;

        feed.updateAnswer(_belowThreshold(seed));
        uint80 firstRound = feed.latestRound();

        for (uint256 i = 0; i < steps; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            vm.warp(block.timestamp + bound(seed, 1, 30 minutes));
            feed.updateAnswer(_belowThreshold(seed));
        }
        if (block.timestamp < t0 + WINDOW) vm.warp(t0 + WINDOW);

        market.settleDepeg(firstRound);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
        assertEq(market.breachStart(), t0);
    }

    /// A single at-or-above-threshold round anywhere strictly inside the window
    /// always blocks settlement from the pre-recovery round.
    function testFuzz_interruptionAlwaysBlocks(uint256 seed, uint256 recoveryOffset) public {
        recoveryOffset = bound(recoveryOffset, 1, WINDOW - 1);

        feed.updateAnswer(_belowThreshold(seed));
        uint80 firstRound = feed.latestRound();
        uint256 t0 = block.timestamp;

        vm.warp(t0 + recoveryOffset);
        feed.updateAnswer(_atOrAboveThreshold(seed));
        uint80 recoveryRound = feed.latestRound();

        // breach resumes afterwards — irrelevant for a proof starting at firstRound
        vm.warp(t0 + WINDOW + 1 hours);
        feed.updateAnswer(_belowThreshold(seed));

        vm.expectRevert(abi.encodeWithSelector(CanaryMarket.BreachInterrupted.selector, recoveryRound));
        market.settleDepeg(firstRound);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.Open));
    }

    /// A breach window may start at any breached round, not just the first one
    /// of the streak.
    function testFuzz_anyRoundInStreakWorksAsStart(uint256 seed, uint8 startIndex) public {
        uint256 roundCount = 10;
        uint80[] memory rounds = new uint80[](roundCount);
        for (uint256 i = 0; i < roundCount; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            feed.updateAnswer(_belowThreshold(seed));
            rounds[i] = feed.latestRound();
            vm.warp(block.timestamp + 10 minutes);
        }
        uint80 start = rounds[bound(startIndex, 0, roundCount - 1)];

        // ensure the window from the chosen start has fully elapsed
        vm.warp(block.timestamp + WINDOW + 2 hours);

        market.settleDepeg(start);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }

    function _belowThreshold(uint256 seed) internal pure returns (int256) {
        return int256(bound(uint256(keccak256(abi.encode(seed, "below"))), 1, uint256(THRESHOLD) - 1));
    }

    function _atOrAboveThreshold(uint256 seed) internal pure returns (int256) {
        return int256(bound(uint256(keccak256(abi.encode(seed, "above"))), uint256(THRESHOLD), 2e8));
    }
}
