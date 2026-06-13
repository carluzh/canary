// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

contract ReentrantToken {
    CanaryMarket public target;
    bytes4 public caughtError;

    function setTarget(CanaryMarket target_) external {
        target = target_;
    }

    function transferFrom(address, address, uint256) external returns (bool) {
        return true;
    }

    function transfer(address, uint256) external returns (bool) {
        if (caughtError == 0 && address(target) != address(0)) {
            // re-enter during the collateral push and record what it reverts with
            try target.burnSets(1) {
                caughtError = 0xffffffff; // should be unreachable
            } catch (bytes memory err) {
                caughtError = bytes4(err);
            }
        }
        return true;
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }
}

/// ERC20 that signals failure by returning false instead of reverting — the
/// pattern the TransferFailed checks exist for.
contract FalseToken {
    bool public fail;

    function setFail(bool fail_) external {
        fail = fail_;
    }

    function transfer(address, uint256) external view returns (bool) {
        return !fail;
    }

    function transferFrom(address, address, uint256) external view returns (bool) {
        return !fail;
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }
}

contract CanaryMarketTest is BaseTest {
    // ----------------------------------------------------------- constructor

    function test_constructor_setsConfig() public view {
        assertEq(address(market.collateral()), address(usdc));
        assertEq(address(market.priceFeed()), address(feed));
        assertEq(market.depegThreshold(), THRESHOLD);
        assertEq(market.breachWindow(), WINDOW);
        assertEq(market.expiry(), expiry);
        assertEq(market.settlementGrace(), GRACE);
        assertEq(market.createdAt(), START_TIME);
        assertEq(market.description(), "USDe < $0.95 for 1h");
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.Open));
    }

    function test_constructor_revert_zeroAddresses() public {
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        new CanaryMarket(
            IERC20(address(0)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        new CanaryMarket(
            IERC20(address(usdc)), AggregatorV3Interface(address(0)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
    }

    function test_constructor_revert_badThreshold() public {
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        new CanaryMarket(IERC20(address(usdc)), AggregatorV3Interface(address(feed)), 0, WINDOW, expiry, GRACE, "");
    }

    function test_constructor_revert_zeroWindow() public {
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        new CanaryMarket(IERC20(address(usdc)), AggregatorV3Interface(address(feed)), THRESHOLD, 0, expiry, GRACE, "");
    }

    function test_constructor_revert_windowDoesNotFitBeforeExpiry() public {
        // expiry only `WINDOW` away: no breach could ever complete.
        vm.expectRevert(CanaryMarket.InvalidParams.selector);
        new CanaryMarket(
            IERC20(address(usdc)),
            AggregatorV3Interface(address(feed)),
            THRESHOLD,
            WINDOW,
            uint64(block.timestamp) + WINDOW,
            GRACE,
            ""
        );
    }

    // -------------------------------------------------------------- complete sets

    function test_mintSets_creditsBothSides() public {
        _mintSets(bob, 100e6);
        assertEq(market.yesBalance(bob), 100e6);
        assertEq(market.noBalance(bob), 100e6);
        assertEq(market.yesSupply(), 100e6);
        assertEq(market.noSupply(), 100e6);
        assertEq(usdc.balanceOf(address(market)), 100e6);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS - 100e6);
    }

    function test_mintSets_revert_zeroAmount() public {
        vm.expectRevert(CanaryMarket.ZeroAmount.selector);
        vm.prank(bob);
        market.mintSets(0);
    }

    function test_mintSets_revert_afterExpiry() public {
        vm.warp(expiry);
        vm.expectRevert(CanaryMarket.TradingClosed.selector);
        vm.prank(bob);
        market.mintSets(1e6);
    }

    function test_mintSets_revert_withoutFunds() public {
        address pauper = makeAddr("pauper");
        vm.startPrank(pauper);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert("insufficient balance");
        market.mintSets(1e6);
        vm.stopPrank();
    }

    function test_burnSets_roundTrip() public {
        _mintSets(bob, 100e6);
        vm.prank(bob);
        market.burnSets(100e6);
        assertEq(market.yesBalance(bob), 0);
        assertEq(market.noBalance(bob), 0);
        assertEq(market.yesSupply(), 0);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_burnSets_allowedAfterExpiryBeforeResolution() public {
        _mintSets(bob, 100e6);
        vm.warp(expiry + 1);
        vm.prank(bob);
        market.burnSets(40e6);
        assertEq(market.yesSupply(), 60e6);
    }

    function test_burnSets_revert_zeroAmount() public {
        vm.expectRevert(CanaryMarket.ZeroAmount.selector);
        vm.prank(bob);
        market.burnSets(0);
    }

    function test_burnSets_revert_insufficientBalance() public {
        _mintSets(bob, 100e6);
        vm.expectRevert(CanaryMarket.InsufficientBalance.selector);
        vm.prank(bob);
        market.burnSets(100e6 + 1);
    }

    function test_burnSets_revert_afterResolution() public {
        _mintSets(bob, 100e6);
        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();
        vm.expectRevert(CanaryMarket.MarketNotOpen.selector);
        vm.prank(bob);
        market.burnSets(1e6);
    }

    function test_burnSets_revert_whenOneSideLocked() public {
        // Selling YES escrows it; a full-size set burn must then fail.
        _mintSets(bob, 100e6);
        vm.prank(bob);
        market.placeOrder(true, false, 0.05e6, 100e6);
        vm.expectRevert(CanaryMarket.InsufficientBalance.selector);
        vm.prank(bob);
        market.burnSets(100e6);
    }

    // ------------------------------------------------------------------ redeem

    function test_redeem_yesWinsAfterDepeg() public {
        _mintSets(bob, 100e6);
        // bob sells 100 YES to alice at 0.05 — classic underwriter flow
        vm.prank(bob);
        uint256 orderId = market.placeOrder(true, false, 0.05e6, 100e6);
        vm.prank(alice);
        market.fillOrder(orderId, 100e6);

        uint80 firstRound = _breachFor(WINDOW, 10 minutes);
        market.settleDepeg(firstRound);

        vm.prank(alice);
        uint256 payout = market.redeem();
        assertEq(payout, 100e6);
        // alice paid ceil(100e6 * 0.05) = 5e6 premium, receives 100e6
        assertEq(usdc.balanceOf(alice), ACTOR_FUNDS - 5e6 + 100e6);

        // bob's NO is worthless
        vm.expectRevert(CanaryMarket.NothingToRedeem.selector);
        vm.prank(bob);
        market.redeem();
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_redeem_noWinsAfterExpiry() public {
        _mintSets(bob, 100e6);
        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();

        vm.prank(bob);
        uint256 payout = market.redeem();
        assertEq(payout, 100e6);
        assertEq(usdc.balanceOf(bob), ACTOR_FUNDS);
    }

    function test_redeem_revert_whileOpen() public {
        _mintSets(bob, 100e6);
        vm.expectRevert(CanaryMarket.NotResolved.selector);
        vm.prank(bob);
        market.redeem();
    }

    function test_redeem_revert_double() public {
        _mintSets(bob, 100e6);
        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();
        vm.startPrank(bob);
        market.redeem();
        vm.expectRevert(CanaryMarket.NothingToRedeem.selector);
        market.redeem();
        vm.stopPrank();
    }

    // ------------------------------------------------------------------- views

    function test_marketInfo() public {
        _mintSets(bob, 7e6);
        (
            CanaryMarket.State state_,
            address collateral_,
            address feed_,
            int256 threshold_,
            uint64 window_,
            uint64 expiry_,
            uint64 grace_,
            uint256 yesSupply_,
            uint256 noSupply_,
            string memory description_
        ) = market.marketInfo();
        assertEq(uint256(state_), uint256(CanaryMarket.State.Open));
        assertEq(collateral_, address(usdc));
        assertEq(feed_, address(feed));
        assertEq(threshold_, THRESHOLD);
        assertEq(window_, WINDOW);
        assertEq(expiry_, expiry);
        assertEq(grace_, GRACE);
        assertEq(yesSupply_, 7e6);
        assertEq(noSupply_, 7e6);
        assertEq(description_, "USDe < $0.95 for 1h");
    }

    // -------------------------------------------------------- transfer failures

    function test_transferFailed_onAllCollateralPaths() public {
        FalseToken falseToken = new FalseToken();
        CanaryMarket m = new CanaryMarket(
            IERC20(address(falseToken)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );

        // pull path (mintSets)
        falseToken.setFail(true);
        vm.expectRevert(CanaryMarket.TransferFailed.selector);
        m.mintSets(10);

        // push path (burnSets)
        falseToken.setFail(false);
        m.mintSets(10);
        falseToken.setFail(true);
        vm.expectRevert(CanaryMarket.TransferFailed.selector);
        m.burnSets(1);

        // direct taker->maker path (filling a sell order)
        falseToken.setFail(false);
        uint256 id = m.placeOrder(true, false, 0.05e6, 5);
        falseToken.setFail(true);
        vm.expectRevert(CanaryMarket.TransferFailed.selector);
        m.fillOrder(id, 1);
    }

    // -------------------------------------------------------------- reentrancy

    function test_reentrancy_blocked() public {
        ReentrantToken evil = new ReentrantToken();
        CanaryMarket evilMarket = new CanaryMarket(
            IERC20(address(evil)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
        evil.setTarget(evilMarket);
        evilMarket.mintSets(10); // transferFrom is a no-op that returns true
        // burnSets pushes collateral -> evil re-enters burnSets -> guard trips.
        // The evil token catches the inner revert so we can assert its selector.
        evilMarket.burnSets(1);
        assertEq(evil.caughtError(), CanaryMarket.Reentrancy.selector);
    }
}
