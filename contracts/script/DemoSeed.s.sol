// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CanaryMarket} from "../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../src/CanaryMarketFactory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../src/mocks/MockV3Aggregator.sol";

/// LOCAL ANVIL ONLY — seeds a complete demo scenario for frontend work:
/// a live market with a 15-minute breach window, an underwriter quoting
/// premiums, and a coverage buyer already holding YES.
///
///   anvil                       # terminal 1
///   forge script script/DemoSeed.s.sol --rpc-url http://localhost:8545 --broadcast
///
/// Then to demo the depeg end-to-end (terminal 2):
///   cast send $FEED "updateAnswer(int256)" 85000000 --private-key $PK0   # USDe -> $0.85
///   ROUND=$(cast call $FEED "latestRound()(uint80)")                     # the first breached round
///   cast rpc evm_increaseTime 901 && cast rpc evm_mine                   # wait out the 15m window
///   cast send $MARKET "settleDepeg(uint80)" $ROUND --private-key $PK0    # anyone can settle
///   cast send $MARKET "redeem()" --private-key $PK0                      # buyer collects payout
/// (Verified end-to-end on anvil: settleDepeg flips state to TriggeredYes(1),
///  the buyer's YES redeems 1:1.)
contract DemoSeed is Script {
    // anvil's default funded accounts
    uint256 internal constant ALICE_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // #0, buyer
    uint256 internal constant BOB_PK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // #1, underwriter

    function run() external {
        address alice = vm.addr(ALICE_PK);
        address bob = vm.addr(BOB_PK);

        // --- deploy stack (alice is the deployer)
        vm.startBroadcast(ALICE_PK);
        MockUSDC usdc = new MockUSDC();
        MockV3Aggregator feed = new MockV3Aggregator(8, 1e8);
        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(address(usdc)));
        CanaryMarket market = CanaryMarket(
            factory.createMarket(
                AggregatorV3Interface(address(feed)),
                0.95e8,
                15 minutes, // short window so the live demo settles fast
                uint64(block.timestamp + 2 days),
                30 minutes,
                "USDe < $0.95 for 15m"
            )
        );
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
        usdc.approve(address(market), type(uint256).max);
        vm.stopBroadcast();

        // --- bob underwrites: mints 10k sets, asks 2c per dollar of YES cover
        vm.startBroadcast(BOB_PK);
        usdc.approve(address(market), type(uint256).max);
        market.mintSets(10_000e6);
        uint256 askId = market.placeOrder(true, false, 0.02e6, 10_000e6);
        vm.stopBroadcast();

        // --- alice buys $5k of coverage at the ask (premium: $100)
        vm.startBroadcast(ALICE_PK);
        market.fillOrder(askId, 5_000e6);
        vm.stopBroadcast();

        console2.log("USDC:           ", address(usdc));
        console2.log("Feed (USDe/USD):", address(feed));
        console2.log("Factory:        ", address(factory));
        console2.log("Market:         ", address(market));
        console2.log("Open ask: 5,000 YES left at $0.02 (implied depeg probability 2%)");
        console2.log("alice holds 5,000 YES (coverage), bob holds 10,000 NO + premium");
    }
}
