// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../../src/CanaryMarketFactory.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

contract FactoryTest is BaseTest {
    function test_constructor_revert_zeroCollateral() public {
        vm.expectRevert(CanaryMarketFactory.ZeroAddress.selector);
        new CanaryMarketFactory(IERC20(address(0)));
    }

    function test_createMarket_registersAndEmits() public {
        assertEq(factory.marketCount(), 1); // canonical market from setUp

        vm.expectEmit(false, true, true, true);
        emit CanaryMarketFactory.MarketCreated(
            address(0), address(feed), alice, 0.97e8, 30 minutes, expiry, "USDT < $0.97 for 30m"
        );
        vm.prank(alice);
        address m = factory.createMarket(
            AggregatorV3Interface(address(feed)), 0.97e8, 30 minutes, expiry, GRACE, "USDT < $0.97 for 30m"
        );

        assertEq(factory.marketCount(), 2);
        assertEq(factory.markets(1), m);
        address[] memory all = factory.allMarkets();
        assertEq(all.length, 2);
        assertEq(all[0], address(market));
        assertEq(all[1], m);

        CanaryMarket created = CanaryMarket(m);
        assertEq(address(created.collateral()), address(usdc));
        assertEq(created.depegThreshold(), 0.97e8);
        assertEq(created.breachWindow(), 30 minutes);
        assertEq(created.description(), "USDT < $0.97 for 30m");
    }

    function test_createMarket_propagatesValidation() public {
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        factory.createMarket(AggregatorV3Interface(address(feed)), 0, WINDOW, expiry, GRACE, "");
    }
}
