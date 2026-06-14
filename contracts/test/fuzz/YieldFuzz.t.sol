// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../../src/CanaryMarketFactory.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IYieldStrategy} from "../../src/interfaces/IYieldStrategy.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../../src/mocks/MockV3Aggregator.sol";
import {MockYieldVault} from "../../src/mocks/MockYieldVault.sol";

contract YieldFuzzTest is Test {
    MockUSDC internal usdc;
    MockV3Aggregator internal feed;
    MockYieldVault internal vault;
    CanaryMarketFactory internal factory;

    address internal under = makeAddr("underwriter");
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");
    uint64 internal expiry;
    uint256 internal constant FUNDS = 1_000_000_000e6;

    function setUp() public {
        vm.warp(1_750_000_000);
        usdc = new MockUSDC();
        feed = new MockV3Aggregator(8, 1e8);
        vault = new MockYieldVault(IERC20(address(usdc)));
        factory = new CanaryMarketFactory(IERC20(address(usdc)));
        expiry = uint64(block.timestamp) + 30 days;
        usdc.mint(under, FUNDS);
        usdc.mint(buyer, FUNDS);
        usdc.mint(address(this), FUNDS);
        usdc.approve(address(vault), type(uint256).max);
    }

    /// For any (yield, fee, rebate, position size): the split is exact up to
    /// integer-division dust, the proportions match the bps, and the market
    /// stays solvent (holds at least everything it owes).
    function testFuzz_splitAndSolvency(uint256 yieldAmt, uint256 feeBps, uint256 rebateBps, uint128 size) public {
        feeBps = bound(feeBps, 0, 2_000);
        rebateBps = bound(rebateBps, 0, 10_000);
        size = uint128(bound(size, 1e6, 1_000_000e6));
        yieldAmt = bound(yieldAmt, 1, 10_000_000e6);

        CanaryMarket m = CanaryMarket(
            factory.createYieldMarket(
                AggregatorV3Interface(address(feed)), 0.95e8, 1 hours, expiry, 1 hours, "f",
                IYieldStrategy(address(vault)), feeBps, rebateBps, treasury
            )
        );
        vm.prank(under);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(m), type(uint256).max);

        // underwriter mints `size`, sells all YES to buyer -> buyer holds YES, underwriter holds NO
        vm.prank(under);
        m.mintSets(size);
        vm.prank(under);
        uint256 id = m.placeOrder(true, false, 1, size); // price ~0, trivial premium
        vm.prank(buyer);
        m.fillOrder(id, size);

        vault.simulateYield(yieldAmt);
        m.harvestYield();

        uint256 fee = (yieldAmt * feeBps) / 10_000;
        uint256 dist = yieldAmt - fee;
        uint256 expectedBuyer = (dist * rebateBps) / 10_000;
        uint256 expectedUnder = dist - expectedBuyer;

        // proportions hold, up to dust from the per-share accumulator division
        uint256 dust = 2; // a couple of base units
        assertEq(m.feeAccrued(), fee, "fee exact");
        assertApproxEqAbs(m.pendingYield(buyer), expectedBuyer, dust, "buyer share");
        assertApproxEqAbs(m.pendingYield(under), expectedUnder, dust, "underwriter share");

        // solvency: the venue + idle covers principal + everything credited
        uint256 owed = m.yesSupply() + m.totalBuyEscrow() + m.pendingYield(buyer) + m.pendingYield(under) + m.feeAccrued();
        assertGe(m.totalCollateralValue(), owed, "market is solvent");
    }

    /// Whatever the yield path, after resolution every claimant is fully paid
    /// and the market drains without reverting (no shortfall).
    function testFuzz_everyoneGetsPaid(uint256 yieldAmt, uint128 size, bool depeg) public {
        size = uint128(bound(size, 1e6, 1_000_000e6));
        yieldAmt = bound(yieldAmt, 0, 10_000_000e6);

        CanaryMarket m = CanaryMarket(
            factory.createYieldMarket(
                AggregatorV3Interface(address(feed)), 0.95e8, 1 hours, expiry, 1 hours, "f",
                IYieldStrategy(address(vault)), 0, 3_000, treasury
            )
        );
        vm.prank(under);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(m), type(uint256).max);

        vm.prank(under);
        m.mintSets(size);
        vm.prank(under);
        uint256 id = m.placeOrder(true, false, 1, size);
        vm.prank(buyer);
        m.fillOrder(id, size);

        if (yieldAmt > 0) {
            vault.simulateYield(yieldAmt);
            m.harvestYield();
        }

        if (depeg) {
            feed.updateAnswer(0.90e8);
            uint80 r = feed.latestRound();
            vm.warp(block.timestamp + 1 hours + 1);
            m.settleDepeg(r);
        } else {
            vm.warp(uint256(expiry) + 1 hours + 1);
            m.settleExpiry();
        }

        // winner redeems (principal + their yield), loser claims their yield.
        address winner = depeg ? buyer : under;
        address loser = depeg ? under : buyer;
        vm.prank(winner);
        m.redeem();
        if (m.pendingYield(loser) > 0) {
            vm.prank(loser);
            m.claimYield();
        }

        // no stranded value beyond rounding dust
        assertLe(m.totalCollateralValue(), 10, "drains to dust");
    }
}
