// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryReportReceiver, ICanaryMarketSettle} from "../../src/cre/CanaryReportReceiver.sol";

contract CreReceiverTest is BaseTest {
    address internal forwarder = makeAddr("keystoneForwarder");
    CanaryReportReceiver internal receiver;

    function setUp() public override {
        super.setUp();
        receiver = new CanaryReportReceiver(forwarder, ICanaryMarketSettle(address(market)));
    }

    /// The Keystone Forwarder delivers the CRE report (breach round id) and the
    /// receiver relays it into the permissionless settleDepeg.
    function test_onReport_settlesDepeg() public {
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);

        vm.expectEmit(true, false, false, true, address(receiver));
        emit CanaryReportReceiver.Settled(firstRound);
        vm.prank(forwarder);
        receiver.onReport("", abi.encode(firstRound));

        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));
    }

    function test_onReport_revert_notForwarder() public {
        uint80 firstRound = _breachFor(WINDOW, 10 minutes);
        vm.expectRevert(CanaryReportReceiver.NotForwarder.selector);
        receiver.onReport("", abi.encode(firstRound));
    }

    /// If the breach isn't provable yet, settleDepeg reverts through onReport —
    /// the workflow simply retries on the next cron tick.
    function test_onReport_revert_whenNotProvable() public {
        feed.updateAnswer(0.90e8); // single dip, window not elapsed
        uint80 round = feed.latestRound();
        vm.prank(forwarder);
        vm.expectRevert(CanaryMarket.BreachWindowNotElapsed.selector);
        receiver.onReport("", abi.encode(round));
    }

    function test_supportsInterface() public view {
        assertTrue(receiver.supportsInterface(0x01ffc9a7));
        assertTrue(receiver.supportsInterface(receiver.onReport.selector));
        assertFalse(receiver.supportsInterface(0xffffffff));
    }
}
