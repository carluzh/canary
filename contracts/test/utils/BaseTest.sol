// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../../src/CanaryMarketFactory.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../../src/mocks/MockV3Aggregator.sol";

/// @notice Shared fixture: USDC, a USDe/USD mock feed at $1.00, a factory and a
/// canonical market ("USDe < $0.95 for 1h", 30-day expiry, 1h settlement grace).
abstract contract BaseTest is Test {
    MockUSDC internal usdc;
    MockV3Aggregator internal feed;
    CanaryMarketFactory internal factory;
    CanaryMarket internal market;

    address internal alice = makeAddr("alice"); // coverage buyer
    address internal bob = makeAddr("bob"); // underwriter
    address internal carol = makeAddr("carol");

    uint8 internal constant FEED_DECIMALS = 8;
    int256 internal constant PEG = 1e8; // $1.00
    int256 internal constant THRESHOLD = 0.95e8; // $0.95
    uint64 internal constant WINDOW = 1 hours;
    uint64 internal constant GRACE = 1 hours;
    uint64 internal constant LIFETIME = 30 days;
    uint256 internal constant START_TIME = 1_750_000_000;
    uint256 internal constant ACTOR_FUNDS = 1_000_000e6;

    uint64 internal expiry;

    function setUp() public virtual {
        vm.warp(START_TIME);
        usdc = new MockUSDC();
        feed = new MockV3Aggregator(FEED_DECIMALS, PEG);
        factory = new CanaryMarketFactory(IERC20(address(usdc)));
        expiry = uint64(block.timestamp) + LIFETIME;
        market = CanaryMarket(
            factory.createMarket(
                AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, "USDe < $0.95 for 1h"
            )
        );

        address[3] memory actors = [alice, bob, carol];
        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], ACTOR_FUNDS);
            vm.prank(actors[i]);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    function _mintSets(address who, uint256 amount) internal {
        vm.prank(who);
        market.mintSets(amount);
    }

    /// @notice Push below-threshold rounds every `step` seconds for `duration`,
    /// starting at the current timestamp. Returns the first breached round id.
    /// Leaves block.timestamp at breach start + duration.
    function _breachFor(uint256 duration, uint256 step) internal returns (uint80 firstRound) {
        feed.updateAnswer(0.90e8);
        firstRound = feed.latestRound();
        uint256 start = block.timestamp;
        while (block.timestamp < start + duration) {
            vm.warp(block.timestamp + step);
            feed.updateAnswer(0.90e8);
        }
    }
}
