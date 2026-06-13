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

/// @dev Drives a yield-enabled market through random mint/trade/yield/claim
/// sequences. fail_on_revert is left off (the order book has many natural
/// preconditions); the point is the solvency invariant after every call.
contract YieldHandler is Test {
    CanaryMarket public market;
    MockUSDC public usdc;
    MockYieldVault public vault;
    address[] public actors;

    constructor(CanaryMarket market_, MockUSDC usdc_, MockYieldVault vault_) {
        market = market_;
        usdc = usdc_;
        vault = vault_;
        for (uint256 i = 0; i < 3; i++) {
            address a = makeAddr(string(abi.encodePacked("ya", i)));
            actors.push(a);
            vm.prank(a);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function mint(uint256 s, uint256 amt) external {
        address a = _actor(s);
        amt = bound(amt, 1e6, 100_000e6);
        usdc.mint(a, amt);
        vm.prank(a);
        try market.mintSets(amt) {} catch {}
    }

    function sellYes(uint256 s, uint256 amt, uint256 price) external {
        address a = _actor(s);
        uint256 bal = market.yesBalance(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        price = bound(price, 1, 1e6 - 1);
        vm.prank(a);
        try market.placeOrder(true, false, uint64(price), uint128(amt)) {} catch {}
    }

    function fill(uint256 s, uint256 orderSeed, uint256 amt) external {
        address a = _actor(s);
        uint256 total = market.nextOrderId();
        if (total == 0) return;
        for (uint256 i = 0; i < total; i++) {
            uint256 id = (orderSeed + i) % total;
            (, bool isYes, bool isBuy,, uint128 remaining,) = market.orders(id);
            if (remaining == 0 || isBuy) continue;
            uint128 take = uint128(bound(amt, 1, remaining));
            // taker pays premium directly; fund them
            usdc.mint(a, uint256(take));
            vm.prank(a);
            try market.fillOrder(id, take) {} catch {}
            isYes; // silence
            return;
        }
    }

    function injectYield(uint256 amt) external {
        amt = bound(amt, 1, 50_000e6);
        usdc.mint(address(this), amt);
        usdc.approve(address(vault), amt);
        vault.simulateYield(amt);
        try market.harvestYield() {} catch {}
    }

    function claim(uint256 s) external {
        address a = _actor(s);
        vm.prank(a);
        try market.claimYield() {} catch {}
    }
}

contract YieldInvariantTest is Test {
    CanaryMarket internal market;
    MockUSDC internal usdc;
    MockYieldVault internal vault;
    YieldHandler internal handler;

    function setUp() public {
        vm.warp(1_750_000_000);
        usdc = new MockUSDC();
        MockV3Aggregator feed = new MockV3Aggregator(8, 1e8);
        vault = new MockYieldVault(IERC20(address(usdc)));
        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(address(usdc)));
        market = CanaryMarket(
            factory.createYieldMarket(
                AggregatorV3Interface(address(feed)), 0.95e8, 1 hours, uint64(block.timestamp + 30 days), 1 hours,
                "inv", IYieldStrategy(address(vault)), 500, 3_000, makeAddr("treasury")
            )
        );
        handler = new YieldHandler(market, usdc, vault);
        targetContract(address(handler));
    }

    /// The market always controls at least what it owes: principal (live sets +
    /// buy escrow) plus all credited-but-unclaimed yield plus the protocol fee.
    function invariant_solventIncludingYield() public view {
        uint256 owed = market.yesSupply() + market.totalBuyEscrow() + market.feeAccrued();
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            owed += market.pendingYield(handler.actors(i));
        }
        // +small tolerance for per-share accumulator division dust
        assertGe(market.totalCollateralValue() + 16, owed, "market under-collateralised");
    }

    /// Credited yield never exceeds what the venue actually generated.
    function invariant_noYieldFromThinAir() public view {
        // creditedUnclaimed = totalCredited - totalYieldClaimed must be backed by
        // (value - principal).
        uint256 creditedUnclaimed = market.totalCredited() - market.totalYieldClaimed();
        uint256 principal = market.yesSupply() + market.totalBuyEscrow();
        assertGe(market.totalCollateralValue() + 16, principal + creditedUnclaimed, "phantom yield");
    }
}
