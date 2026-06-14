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

contract YieldTest is Test {
    MockUSDC internal usdc;
    MockV3Aggregator internal feed;
    MockYieldVault internal vault;
    CanaryMarketFactory internal factory;
    CanaryMarket internal market;

    address internal under = makeAddr("underwriter");
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");

    int256 internal constant THRESHOLD = 0.95e8;
    uint64 internal constant WINDOW = 1 hours;
    uint64 internal constant GRACE = 1 hours;
    uint256 internal constant START = 1_750_000_000;
    uint256 internal constant FUNDS = 1_000_000e6;

    uint64 internal expiry;

    function setUp() public virtual {
        vm.warp(START);
        usdc = new MockUSDC();
        feed = new MockV3Aggregator(8, 1e8);
        vault = new MockYieldVault(IERC20(address(usdc)));
        factory = new CanaryMarketFactory(IERC20(address(usdc)));
        expiry = uint64(block.timestamp) + 30 days;
        // 0% protocol fee (testnet), 30% of net yield rebated to buyers.
        market = CanaryMarket(
            factory.createYieldMarket(
                AggregatorV3Interface(address(feed)),
                THRESHOLD,
                WINDOW,
                expiry,
                GRACE,
                "USDe < $0.95 for 1h (yield)",
                IYieldStrategy(address(vault)),
                0,
                3_000,
                treasury
            )
        );
        for (uint256 i = 0; i < 3; i++) {
            address a = [under, buyer, treasury][i];
            usdc.mint(a, FUNDS);
            vm.prank(a);
            usdc.approve(address(market), type(uint256).max);
        }
        // fund this test contract for direct yield injection into the vault
        usdc.mint(address(this), FUNDS);
        usdc.approve(address(vault), type(uint256).max);
    }

    // --------- helpers

    function _mint(address who, uint256 amt) internal {
        vm.prank(who);
        market.mintSets(amt);
    }

    /// underwriter mints `amt` sets and sells all YES to `buyer` at `price`.
    function _underwriteAndSell(uint256 amt, uint64 price) internal returns (uint256 premium) {
        _mint(under, amt);
        vm.prank(under);
        uint256 id = market.placeOrder(true, false, price, uint128(amt));
        vm.prank(buyer);
        market.fillOrder(id, uint128(amt));
        premium = (amt * price + 1e6 - 1) / 1e6;
    }

    function _injectYield(uint256 amt) internal {
        vault.simulateYield(amt);
        market.harvestYield();
    }

    // --------------------------------------------------------- enableYield

    function test_enableYield_revert_assetMismatch() public {
        MockUSDC other = new MockUSDC();
        MockYieldVault badVault = new MockYieldVault(IERC20(address(other)));
        vm.expectRevert(CanaryMarket.InvalidYieldConfig.selector);
        factory.createYieldMarket(
            AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, "x",
            IYieldStrategy(address(badVault)), 0, 3_000, treasury
        );
    }

    function test_enableYield_revert_badConfig() public {
        vm.expectRevert(CanaryMarket.InvalidYieldConfig.selector); // fee > 20%
        factory.createYieldMarket(
            AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, "x",
            IYieldStrategy(address(vault)), 2_001, 0, treasury
        );
        vm.expectRevert(CanaryMarket.InvalidYieldConfig.selector); // rebate > 100%
        factory.createYieldMarket(
            AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, "x",
            IYieldStrategy(address(vault)), 0, 10_001, treasury
        );
    }

    function test_enableYield_revert_notDeployer() public {
        CanaryMarket m = new CanaryMarket(
            IERC20(address(usdc)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
        vm.prank(makeAddr("rando"));
        vm.expectRevert(CanaryMarket.NotDeployer.selector);
        m.enableYield(IYieldStrategy(address(vault)), 0, 3_000, treasury);
    }

    function test_enableYield_revert_twice() public {
        // directly-deployed market: this test contract is the deployer
        CanaryMarket m = new CanaryMarket(
            IERC20(address(usdc)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
        m.enableYield(IYieldStrategy(address(vault)), 0, 3_000, treasury);
        vm.expectRevert(CanaryMarket.YieldAlreadyEnabled.selector);
        m.enableYield(IYieldStrategy(address(vault)), 0, 3_000, treasury);
    }

    function test_enableYield_revert_afterActivity() public {
        CanaryMarket m = new CanaryMarket(
            IERC20(address(usdc)), AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, ""
        );
        usdc.approve(address(m), type(uint256).max);
        m.mintSets(1e6); // activity
        vm.expectRevert(CanaryMarket.YieldAlreadyEnabled.selector);
        m.enableYield(IYieldStrategy(address(vault)), 0, 3_000, treasury);
    }

    // ------------------------------------------------------ rehypothecation

    function test_rehypothecation_100pctDeployed() public {
        _mint(under, 100e6);
        assertEq(usdc.balanceOf(address(market)), 0, "no idle: 100% deployed");
        assertEq(vault.totalAssets(), 100e6, "all collateral in the venue");
        assertEq(market.totalShares(), 100e6, "shares minted 1:1 on first deposit");
        assertEq(market.totalCollateralValue(), 100e6);
    }

    function test_rehypothecation_withdrawRedeemsFromVenue() public {
        _mint(under, 100e6);
        vm.prank(under);
        market.burnSets(40e6);
        assertEq(usdc.balanceOf(under), FUNDS - 60e6, "got 40 back");
        assertEq(vault.totalAssets(), 60e6, "venue drained by exactly 40");
        assertEq(usdc.balanceOf(address(market)), 0, "still nothing idle");
    }

    // ----------------------------------------------------- yield + split

    function test_yield_threeWaySplit() public {
        // 0% fee, 30% buyer / 70% underwriter
        _underwriteAndSell(100e6, 0.02e6); // buyer holds 100 YES, underwriter holds 100 NO
        _injectYield(10e6); // 10 USDC of T-bill-style yield on the 100 deployed

        assertEq(market.pendingYield(buyer), 3e6, "buyer (YES) gets 30%");
        assertEq(market.pendingYield(under), 7e6, "underwriter (NO) gets 70%");
    }

    function test_yield_protocolFee() public {
        // fresh market with a 10% protocol fee
        CanaryMarket m = CanaryMarket(
            factory.createYieldMarket(
                AggregatorV3Interface(address(feed)), THRESHOLD, WINDOW, expiry, GRACE, "fee",
                IYieldStrategy(address(vault)), 1_000, 3_000, treasury
            )
        );
        vm.prank(under);
        usdc.approve(address(m), type(uint256).max);
        vm.prank(under);
        m.mintSets(100e6); // underwriter holds both sides
        _injectYieldOn(m, 10e6);

        // 10% fee = 1; remaining 9 split 30/70 over the sole holder -> all 9 to them
        m.claimFee();
        assertEq(usdc.balanceOf(treasury), FUNDS + 1e6, "treasury got the 1 USDC fee");
        assertEq(m.pendingYield(under), 9e6, "holder gets the post-fee yield");
    }

    function _injectYieldOn(CanaryMarket m, uint256 amt) internal {
        vault.simulateYield(amt);
        m.harvestYield();
    }

    function test_claimYield_paysOutUSDC() public {
        _underwriteAndSell(100e6, 0.02e6);
        _injectYield(10e6);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        uint256 got = market.claimYield();
        assertEq(got, 3e6);
        assertEq(usdc.balanceOf(buyer), before + 3e6, "claimed as USDC, not vault shares");
    }

    // -------------------------------------------- self-funding cover (headline)

    /// Premium $2; over the market's life the collateral throws off enough yield
    /// that the buyer's rebate exceeds the premium → cover that pays for itself.
    function test_selfFundingCover() public {
        uint256 premium = _underwriteAndSell(100e6, 0.02e6); // buyer paid 2 USDC for 100 cover
        assertEq(premium, 2e6);
        uint256 spent = FUNDS - usdc.balanceOf(buyer);
        assertEq(spent, 2e6, "buyer is down the 2 USDC premium");

        // a fat yield run (long-dated, deep-tail): 20 USDC yield, 30% to buyers = 6
        _injectYield(20e6);
        assertEq(market.pendingYield(buyer), 6e6);

        vm.prank(buyer);
        market.claimYield();
        // net: -2 premium + 6 rebate = +4, and the buyer STILL holds the cover
        assertEq(usdc.balanceOf(buyer), FUNDS + 4e6, "the float more than paid the premium");
        assertEq(market.yesBalance(buyer), 100e6, "...and the cover is still in force");
    }

    // --------------------------------------------- resolution carries yield

    function test_noDepeg_underwriterGetsPrincipalPlusYield() public {
        _underwriteAndSell(100e6, 0.02e6);
        _injectYield(10e6); // underwriter share = 7

        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();

        uint256 before = usdc.balanceOf(under);
        vm.prank(under);
        uint256 payout = market.redeem();
        assertEq(payout, 100e6, "NO principal back");
        assertEq(usdc.balanceOf(under) - before, 107e6, "principal 100 + yield 7");

        // buyer's YES is worthless, but their 3 yield rebate is still claimable
        vm.prank(buyer);
        assertEq(market.claimYield(), 3e6);
    }

    function test_depeg_buyerGetsPayoutPlusYield() public {
        _underwriteAndSell(100e6, 0.02e6);
        _injectYield(10e6); // buyer share = 3

        // sustained breach
        feed.updateAnswer(0.90e8);
        uint80 round = feed.latestRound();
        vm.warp(block.timestamp + WINDOW + 1);
        market.settleDepeg(round);

        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        uint256 payout = market.redeem();
        assertEq(payout, 100e6, "YES insurance pays 1:1");
        assertEq(usdc.balanceOf(buyer) - before, 103e6, "payout 100 + yield 3");

        // underwriter lost the bet but still earned 7 yield while underwriting
        vm.prank(under);
        assertEq(market.claimYield(), 7e6);
    }

    // ------------------------------------------------------------ solvency

    /// After a full lifecycle with yield, everyone redeems/claims and the venue
    /// + market drain to ~empty with no shortfall.
    function test_solvency_drainsToEmpty() public {
        _underwriteAndSell(100e6, 0.02e6);
        _injectYield(10e6);
        vm.warp(uint256(expiry) + GRACE + 1);
        market.settleExpiry();

        vm.prank(under);
        market.redeem(); // principal + 7
        vm.prank(buyer);
        market.claimYield(); // 3
        // (no protocol fee in this market, so nothing to claimFee)

        // everything paid out; nothing meaningfully stranded
        assertLe(market.totalCollateralValue(), 1, "market drained to dust");
        // underwriter: +2 premium received, +7 yield (mint 100 and principal 100 cancel)
        assertEq(usdc.balanceOf(under), FUNDS + 2e6 + 7e6, "premium + yield earned");
        // buyer: -2 premium, +3 rebate
        assertEq(usdc.balanceOf(buyer), FUNDS - 2e6 + 3e6, "premium out, rebate in");
    }
}
